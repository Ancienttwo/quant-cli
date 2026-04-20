import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AutomationDaemonLockError,
  type AutomationRunRecord,
  acquireAutomationDaemonLock,
  CONFIG_DIR,
  claimAutomationJob,
  completeAutomationJob,
  getAutomationDaemonLockPath,
  getAutomationJob,
  listAutomationJobs,
  readEvents,
  recoverExpiredAutomationJobs,
  removeAutomationJob,
  scheduleAutomationJob,
} from "../../src/index.js";

const EVENT_LOG_PATH = join(
  process.env.HOME ?? "/tmp",
  ".tonquant",
  "test-automation-events.jsonl",
);
const EVENT_LOG_LOCK_PATH = `${EVENT_LOG_PATH}.lock`;

const createdJobIds = new Set<string>();
const createdRunDirs = new Set<string>();

function uniqueId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function rememberJob(jobId: string): string {
  createdJobIds.add(jobId);
  return jobId;
}

function resetEventLogEnv(): void {
  process.env.TONQUANT_EVENT_LOG_PATH = EVENT_LOG_PATH;
  delete process.env.TONQUANT_EVENT_LOG_FAIL_APPEND;
}

function clearEventArtifacts(): void {
  if (existsSync(EVENT_LOG_PATH)) rmSync(EVENT_LOG_PATH);
  if (existsSync(EVENT_LOG_LOCK_PATH)) rmSync(EVENT_LOG_LOCK_PATH);
}

function automationRunDir(runId: string): string {
  return join(CONFIG_DIR, "quant", "automation-runs", runId);
}

describe("automation service", () => {
  beforeEach(() => {
    resetEventLogEnv();
    clearEventArtifacts();
  });

  afterEach(() => {
    for (const jobId of createdJobIds) {
      removeAutomationJob(jobId);
    }
    createdJobIds.clear();

    for (const runDir of createdRunDirs) {
      if (existsSync(runDir)) {
        rmSync(runDir, { recursive: true, force: true });
      }
    }
    createdRunDirs.clear();

    const lockPath = getAutomationDaemonLockPath();
    if (existsSync(lockPath)) {
      rmSync(lockPath, { force: true });
    }

    clearEventArtifacts();
    delete process.env.TONQUANT_EVENT_LOG_PATH;
    delete process.env.TONQUANT_EVENT_LOG_FAIL_APPEND;
  });

  it("schedules a job and appends an audit event", () => {
    const jobId = rememberJob(uniqueId("automation_schedule_test"));
    const summary = scheduleAutomationJob({
      jobId,
      kind: "factor.alert.evaluate",
      params: { factorId: "factor_a" },
      schedule: { kind: "every", every: "30m" },
      actor: { kind: "manual", id: "test" },
    });

    expect(summary.jobId).toBe(jobId);
    expect(summary.status).toBe("scheduled");
    expect(summary.nextRunAt).not.toBeNull();

    const detail = getAutomationJob(jobId);
    expect(detail.spec.executionKey).toBe("factor-alert:factor_a");

    const events = readEvents({ type: "automation.schedule" });
    expect(events.some((event) => event.entity.id === jobId)).toBe(true);
  });

  it("claims and completes a one-shot job", () => {
    const jobId = rememberJob(uniqueId("automation_complete_test"));
    scheduleAutomationJob({
      jobId,
      kind: "factor.alert.evaluate",
      params: { factorId: "factor_b" },
      schedule: { kind: "at", at: new Date(Date.now() - 60_000).toISOString() },
      actor: { kind: "manual", id: "test" },
    });

    const claimed = claimAutomationJob(jobId, {
      ownerId: "daemon:test",
      actor: { kind: "daemon", id: "daemon:test" },
    });

    const record: AutomationRunRecord = {
      jobId,
      runId: claimed.runId,
      kind: claimed.spec.kind,
      executionKey: claimed.spec.executionKey,
      actor: { kind: "daemon", id: "daemon:test" },
      status: "completed",
      startedAt: claimed.state.lastStartedAt ?? new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      summary: "Completed in test.",
      artifactPaths: [],
    };

    completeAutomationJob(record);

    const detail = getAutomationJob(jobId);
    expect(detail.state.status).toBe("completed");
    expect(detail.state.lastRunId).toBe(claimed.runId);
    expect(detail.history).toHaveLength(1);
    expect(detail.history[0]?.status).toBe("success");
  });

  it("reconciles expired leases from a persisted run record", () => {
    const jobId = rememberJob(uniqueId("automation_reconcile_test"));
    scheduleAutomationJob({
      jobId,
      kind: "factor.alert.evaluate",
      params: { factorId: "factor_c" },
      schedule: { kind: "every", every: "15m" },
      actor: { kind: "manual", id: "test" },
    });

    const claimed = claimAutomationJob(jobId, {
      ownerId: "daemon:test",
      actor: { kind: "daemon", id: "daemon:test" },
      leaseMs: 1,
      now: new Date(),
    });

    const runDir = automationRunDir(claimed.runId);
    createdRunDirs.add(runDir);
    mkdirSync(runDir, { recursive: true, mode: 0o700 });
    writeFileSync(
      join(runDir, "result.json"),
      `${JSON.stringify(
        {
          jobId,
          runId: claimed.runId,
          kind: claimed.spec.kind,
          executionKey: claimed.spec.executionKey,
          actor: { kind: "daemon", id: "daemon:test" },
          status: "completed",
          startedAt: claimed.state.lastStartedAt ?? new Date().toISOString(),
          finishedAt: new Date(Date.now() + 100).toISOString(),
          summary: "Recovered from persisted result.",
          artifactPaths: [join(runDir, "result.json")],
        } satisfies AutomationRunRecord,
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const recovered = recoverExpiredAutomationJobs(new Date(Date.now() + 5_000));
    expect(recovered.some((job) => job.jobId === jobId)).toBe(true);

    const detail = getAutomationJob(jobId);
    expect(detail.state.status).toBe("scheduled");
    expect(detail.history.at(-1)?.status).toBe("reconciled");
  });

  it("enforces singleton daemon lock ownership", () => {
    const lock = acquireAutomationDaemonLock("daemon:test");
    expect(() => acquireAutomationDaemonLock("daemon:other")).toThrow(AutomationDaemonLockError);
    lock.release();
  });

  it("quarantines corrupted jobs without blocking list or recovery", () => {
    const healthyJobId = rememberJob(uniqueId("automation_healthy_test"));
    scheduleAutomationJob({
      jobId: healthyJobId,
      kind: "factor.alert.evaluate",
      params: { factorId: "factor_ok" },
      schedule: { kind: "every", every: "30m" },
      actor: { kind: "manual", id: "test" },
    });

    const corruptJobId = rememberJob(uniqueId("automation_corrupt_test"));
    const corruptDir = join(CONFIG_DIR, "automation", "jobs", corruptJobId);
    const corruptRoot = join(CONFIG_DIR, "automation", "corrupt");
    mkdirSync(corruptDir, { recursive: true, mode: 0o700 });
    writeFileSync(join(corruptDir, "spec.json"), "{not-valid-json", "utf-8");
    writeFileSync(join(corruptDir, "state.json"), "{not-valid-json", "utf-8");

    const listed = listAutomationJobs();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.jobId).toBe(healthyJobId);

    const recovered = recoverExpiredAutomationJobs();
    expect(recovered).toEqual([]);

    expect(existsSync(corruptDir)).toBe(false);
    expect(readdirSync(corruptRoot).some((entry) => entry.startsWith(corruptJobId))).toBe(true);
    expect(() => getAutomationJob(corruptJobId)).toThrow();
  });
});

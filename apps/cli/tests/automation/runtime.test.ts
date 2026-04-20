import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  CONFIG_DIR,
  getAutomationJob,
  publishFactor,
  removeAlert,
  removeAutomationJob,
  scheduleAutomationJob,
  setAlert,
} from "@tonquant/core";
import { makeFactor } from "../../../../packages/core/tests/helpers/factor-fixtures.js";
import { runAutomationDaemon, runAutomationJobNow } from "../../src/automation/runtime.js";

const EVENT_LOG_PATH = join(
  process.env.HOME ?? "/tmp",
  ".tonquant",
  "test-cli-automation-events.jsonl",
);
const EVENT_LOG_LOCK_PATH = `${EVENT_LOG_PATH}.lock`;

const createdJobIds = new Set<string>();
const createdArtifactDirs = new Set<string>();
const createdFactorIds = new Set<string>();

function uniqueId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function resetEventLogEnv(): void {
  process.env.TONQUANT_EVENT_LOG_PATH = EVENT_LOG_PATH;
  delete process.env.TONQUANT_EVENT_LOG_FAIL_APPEND;
}

function clearEventArtifacts(): void {
  if (existsSync(EVENT_LOG_PATH)) rmSync(EVENT_LOG_PATH);
  if (existsSync(EVENT_LOG_LOCK_PATH)) rmSync(EVENT_LOG_LOCK_PATH);
}

describe("automation runtime", () => {
  beforeEach(() => {
    resetEventLogEnv();
    clearEventArtifacts();
  });

  afterEach(() => {
    for (const jobId of createdJobIds) {
      removeAutomationJob(jobId);
    }
    createdJobIds.clear();

    for (const factorId of createdFactorIds) {
      removeAlert(factorId);
    }
    createdFactorIds.clear();

    for (const artifactDir of createdArtifactDirs) {
      if (existsSync(artifactDir)) {
        rmSync(artifactDir, { recursive: true, force: true });
      }
    }
    createdArtifactDirs.clear();

    clearEventArtifacts();
    delete process.env.TONQUANT_EVENT_LOG_PATH;
    delete process.env.TONQUANT_EVENT_LOG_FAIL_APPEND;
  });

  it("runs a scheduled job immediately through the shared runtime path", async () => {
    const factorId = uniqueId("runtime_factor");
    createdFactorIds.add(factorId);
    publishFactor(makeFactor(factorId), { force: true });
    setAlert(factorId, "rankIcOosIcir", "above", 1.0);

    const jobId = uniqueId("runtime_run_now");
    createdJobIds.add(jobId);
    scheduleAutomationJob({
      jobId,
      kind: "factor.alert.evaluate",
      params: { factorId },
      schedule: { kind: "every", every: "30m" },
      actor: { kind: "manual", id: "test" },
    });

    const result = await runAutomationJobNow({ jobId });
    const detail = getAutomationJob(jobId);

    expect(result.record.status).toBe("completed");
    expect(detail.state.lastRunId).toBe(result.record.runId);
    expect(detail.history.at(-1)?.status).toBe("success");

    const artifactDir = dirname(
      result.record.artifactPaths.find((path) => path.endsWith("result.json")) ?? "",
    );
    createdArtifactDirs.add(artifactDir);
    expect(
      existsSync(join(CONFIG_DIR, "quant", "automation-runs", result.record.runId, "result.json")),
    ).toBe(true);
  });

  it("executes one due job in daemon once mode", async () => {
    const factorId = uniqueId("daemon_factor");
    createdFactorIds.add(factorId);
    publishFactor(makeFactor(factorId), { force: true });
    setAlert(factorId, "rankIcOosIcir", "above", 1.0);

    const jobId = uniqueId("daemon_job");
    createdJobIds.add(jobId);
    const dueAtMs = Date.now() + 50;
    scheduleAutomationJob({
      jobId,
      kind: "factor.alert.evaluate",
      params: { factorId },
      schedule: { kind: "at", at: new Date(dueAtMs).toISOString() },
      actor: { kind: "manual", id: "test" },
    });

    await new Promise((resolve) => setTimeout(resolve, Math.max(0, dueAtMs - Date.now()) + 25));
    const result = await runAutomationDaemon({
      once: true,
      ownerId: uniqueId("daemon_owner"),
    });

    expect(result.executedJobIds).toContain(jobId);
    expect(result.failedJobIds).toHaveLength(0);

    const detail = getAutomationJob(jobId);
    expect(detail.state.status).toBe("completed");

    const runId = detail.state.lastRunId;
    expect(runId).toBeTruthy();
    if (runId) {
      const artifactDir = join(CONFIG_DIR, "quant", "automation-runs", runId);
      createdArtifactDirs.add(artifactDir);
      expect(existsSync(join(artifactDir, "result.json"))).toBe(true);
    }
  });
});

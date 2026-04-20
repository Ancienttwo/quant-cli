import { randomBytes, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { ServiceError } from "../errors.js";
import {
  type AutomationActor,
  AutomationActorSchema,
  type AutomationHandlerContext,
  type AutomationHandlerResult,
  type AutomationHistoryEntry,
  AutomationHistoryEntrySchema,
  type AutomationJobDetail,
  type AutomationJobId,
  type AutomationJobSpec,
  AutomationJobSpecSchema,
  type AutomationJobState,
  AutomationJobStateSchema,
  type AutomationJobSummary,
  AutomationJobSummarySchema,
  type AutomationRunRecord,
  AutomationRunRecordSchema,
  type ScheduleAutomationRequest,
  ScheduleAutomationRequestSchema,
} from "../types/automation.js";
import { CONFIG_DIR } from "../types/config.js";
import {
  appendTextFile,
  ensureDir,
  readJsonFile,
  writeJsonFileAtomic,
} from "../utils/file-store.js";
import { mutateWithEvent } from "./event-log.js";

const AUTOMATION_ROOT = join(CONFIG_DIR, "automation");
const JOBS_ROOT = join(AUTOMATION_ROOT, "jobs");
const CORRUPT_ROOT = join(AUTOMATION_ROOT, "corrupt");
const DAEMON_LOCK_PATH = join(AUTOMATION_ROOT, "daemon.lock");
const SPEC_FILE = "spec.json";
const STATE_FILE = "state.json";
const HISTORY_FILE = "history.jsonl";
const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const MAX_CONSECUTIVE_FAILURES = 5;
const BASE_BACKOFF_MS = 30 * 1000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;

export class AutomationError extends ServiceError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "AutomationError";
  }
}

export class AutomationJobNotFoundError extends AutomationError {
  constructor(jobId: string) {
    super(`Automation job '${jobId}' not found.`, "AUTOMATION_JOB_NOT_FOUND");
    this.name = "AutomationJobNotFoundError";
  }
}

export class AutomationJobCorruptedError extends AutomationError {
  constructor(jobId: string, reason: string) {
    super(`Automation job '${jobId}' is corrupted: ${reason}`, "AUTOMATION_JOB_CORRUPTED");
    this.name = "AutomationJobCorruptedError";
  }
}

export class AutomationDaemonLockError extends AutomationError {
  constructor(message: string) {
    super(message, "AUTOMATION_DAEMON_LOCKED");
    this.name = "AutomationDaemonLockError";
  }
}

export class AutomationJobStateError extends AutomationError {
  constructor(message: string, code = "AUTOMATION_INVALID_STATE") {
    super(message, code);
    this.name = "AutomationJobStateError";
  }
}

interface DaemonLockPayload {
  ownerId: string;
  pid: number;
  acquiredAt: string;
}

export type AutomationHandler = (
  spec: AutomationJobSpec,
  context: AutomationHandlerContext,
) => Promise<AutomationHandlerResult>;

export class AutomationHandlerRegistry {
  private readonly handlers = new Map<AutomationJobSpec["kind"], AutomationHandler>();

  register(kind: AutomationJobSpec["kind"], handler: AutomationHandler): void {
    this.handlers.set(kind, handler);
  }

  get(kind: AutomationJobSpec["kind"]): AutomationHandler {
    const handler = this.handlers.get(kind);
    if (!handler) {
      throw new AutomationError(
        `No automation handler registered for '${kind}'.`,
        "AUTOMATION_HANDLER_MISSING",
      );
    }
    return handler;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function jobDir(jobId: string): string {
  return join(JOBS_ROOT, jobId);
}

function specPath(jobId: string): string {
  return join(jobDir(jobId), SPEC_FILE);
}

function statePath(jobId: string): string {
  return join(jobDir(jobId), STATE_FILE);
}

function historyPath(jobId: string): string {
  return join(jobDir(jobId), HISTORY_FILE);
}

function daemonLockAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function parseEveryDuration(value: string): number {
  const matches = [...value.matchAll(/(\d+)(ms|s|m|h|d)/gu)];
  if (matches.length === 0 || matches.map((entry) => entry[0]).join("") !== value) {
    throw new AutomationError(
      `Invalid schedule interval '${value}'. Expected formats like 30m, 1h, or 1h30m.`,
      "AUTOMATION_SCHEDULE_INVALID",
    );
  }
  const unitMs: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  const totalMs = matches.reduce((sum, entry) => {
    const amount = Number.parseInt(entry[1] ?? "0", 10);
    const unit = (entry[2] ?? "ms") as keyof typeof unitMs;
    const unitValue = unitMs[unit];
    if (unitValue === undefined) {
      throw new AutomationError(
        `Unsupported schedule interval unit '${unit}'.`,
        "AUTOMATION_SCHEDULE_INVALID",
      );
    }
    return sum + amount * unitValue;
  }, 0);
  if (totalMs <= 0) {
    throw new AutomationError(
      `Schedule interval '${value}' must be greater than zero.`,
      "AUTOMATION_SCHEDULE_INVALID",
    );
  }
  return totalMs;
}

export function computeNextRunAt(
  schedule: AutomationJobSpec["schedule"],
  from = new Date(),
): string | null {
  if (schedule.kind === "at") {
    const atMs = Date.parse(schedule.at);
    if (Number.isNaN(atMs)) {
      throw new AutomationError(
        `Invalid schedule timestamp '${schedule.at}'.`,
        "AUTOMATION_SCHEDULE_INVALID",
      );
    }
    if (atMs <= from.getTime()) {
      return null;
    }
    return new Date(atMs).toISOString();
  }
  return new Date(from.getTime() + parseEveryDuration(schedule.every)).toISOString();
}

function deriveExecutionKey(request: ScheduleAutomationRequest): string {
  switch (request.kind) {
    case "autoresearch.track.run":
      return `autoresearch:${request.params.trackId}`;
    case "factor.alert.evaluate":
      return `factor-alert:${request.params.factorId ?? "all"}`;
    case "publish.submission.check":
      return `publish-submission:${request.params.publicationId}`;
  }
}

function createJobId(): AutomationJobId {
  return `job_${randomBytes(8).toString("hex")}`;
}

function createRunId(): string {
  return `run_${randomUUID()}`;
}

function summarize(spec: AutomationJobSpec, state: AutomationJobState): AutomationJobSummary {
  return AutomationJobSummarySchema.parse({
    jobId: spec.jobId,
    kind: spec.kind,
    status: state.status,
    executionKey: spec.executionKey,
    nextRunAt: state.nextRunAt,
    lastRunId: state.lastRunId,
    consecutiveFailures: state.consecutiveFailures,
    updatedAt: state.updatedAt,
  });
}

function readHistoryFile(path: string): AutomationHistoryEntry[] {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf-8").trim();
  if (!raw) return [];
  try {
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => AutomationHistoryEntrySchema.parse(JSON.parse(line)));
  } catch {
    throw new AutomationError(
      `Automation history is corrupted at ${path}.`,
      "AUTOMATION_HISTORY_CORRUPTED",
    );
  }
}

function loadSpec(jobId: string): AutomationJobSpec {
  const spec = readJsonFile(specPath(jobId), AutomationJobSpecSchema, {
    defaultValue: null as never,
    corruptedCode: "AUTOMATION_JOB_CORRUPTED",
    corruptedMessage: `Automation spec for '${jobId}' is corrupted.`,
  });
  if (!spec) {
    throw new AutomationJobNotFoundError(jobId);
  }
  return spec;
}

function loadState(jobId: string): AutomationJobState {
  const state = readJsonFile(statePath(jobId), AutomationJobStateSchema, {
    defaultValue: null as never,
    corruptedCode: "AUTOMATION_JOB_CORRUPTED",
    corruptedMessage: `Automation state for '${jobId}' is corrupted.`,
  });
  if (!state) {
    throw new AutomationJobNotFoundError(jobId);
  }
  return state;
}

function quarantineJob(jobId: string, reason: string): never {
  ensureDir(CORRUPT_ROOT);
  const src = jobDir(jobId);
  const dst = join(CORRUPT_ROOT, `${jobId}-${Date.now()}`);
  if (existsSync(src)) {
    renameSync(src, dst);
  }
  throw new AutomationJobCorruptedError(jobId, reason);
}

function safeLoadDetail(jobId: string): AutomationJobDetail {
  try {
    return {
      spec: loadSpec(jobId),
      state: loadState(jobId),
      history: readHistoryFile(historyPath(jobId)),
    };
  } catch (error) {
    if (error instanceof AutomationJobCorruptedError) throw error;
    if (error instanceof AutomationJobNotFoundError) throw error;
    if (error instanceof ServiceError && error.code === "AUTOMATION_JOB_CORRUPTED") {
      return quarantineJob(jobId, error.message);
    }
    if (error instanceof AutomationError) {
      return quarantineJob(jobId, error.message);
    }
    throw error;
  }
}

function jobIdsFromFs(): string[] {
  ensureDir(JOBS_ROOT);
  return existsSync(JOBS_ROOT) ? readdirSync(JOBS_ROOT).sort() : [];
}

function appendHistory(jobId: string, entry: AutomationHistoryEntry): void {
  appendTextFile(historyPath(jobId), `${JSON.stringify(entry)}\n`);
}

function writeSpec(spec: AutomationJobSpec): void {
  ensureDir(jobDir(spec.jobId));
  writeJsonFileAtomic(specPath(spec.jobId), spec);
}

function writeState(jobId: string, state: AutomationJobState): void {
  ensureDir(jobDir(jobId));
  writeJsonFileAtomic(statePath(jobId), state);
}

function nextBackoffMs(consecutiveFailures: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, consecutiveFailures - 1));
}

function currentRunRecordPath(runId: string, outputDir?: string): string {
  const quantRoot = outputDir ? join(outputDir, "quant") : join(CONFIG_DIR, "quant");
  return join(quantRoot, "automation-runs", runId, "result.json");
}

function outputDirForSpec(spec: AutomationJobSpec): string | undefined {
  if (spec.kind === "autoresearch.track.run") return spec.params.outputDir;
  return undefined;
}

function runningJobIdsByExecutionKey(executionKey: string, excludeJobId?: string): string[] {
  return jobIdsFromFs()
    .filter((jobId) => jobId !== excludeJobId)
    .flatMap((jobId) => {
      try {
        const detail = safeLoadDetail(jobId);
        return detail.spec.executionKey === executionKey && detail.state.status === "running"
          ? [jobId]
          : [];
      } catch {
        return [];
      }
    });
}

function assertNoConcurrentExecution(spec: AutomationJobSpec, jobId?: string): void {
  const conflicting = runningJobIdsByExecutionKey(spec.executionKey, jobId);
  if (conflicting.length > 0) {
    throw new AutomationJobStateError(
      `Execution key '${spec.executionKey}' is already running in job '${conflicting[0]}'.`,
      "AUTOMATION_EXECUTION_CONFLICT",
    );
  }
}

export function scheduleAutomationJob(request: ScheduleAutomationRequest): AutomationJobSummary {
  const parsed = ScheduleAutomationRequestSchema.parse(request);
  const jobId = parsed.jobId ?? createJobId();
  const createdAt = nowIso();
  const spec = AutomationJobSpecSchema.parse({
    ...parsed,
    jobId,
    executionKey: deriveExecutionKey(parsed),
    createdAt,
  });
  const nextRunAt = computeNextRunAt(spec.schedule, new Date());
  const state = AutomationJobStateSchema.parse({
    status: nextRunAt === null ? "completed" : "scheduled",
    nextRunAt,
    lastRunId: null,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastSuccessAt: null,
    consecutiveFailures: 0,
    lastError: null,
    lastErrorCode: null,
    lease: null,
    updatedAt: createdAt,
  });

  mutateWithEvent({
    paths: [specPath(jobId), statePath(jobId), historyPath(jobId)],
    event: {
      type: "automation.schedule",
      entity: { kind: "automation-job", id: jobId },
      result: "success",
      summary: `Scheduled automation job ${jobId}.`,
      payload: {
        kind: spec.kind,
        executionKey: spec.executionKey,
        nextRunAt: state.nextRunAt,
      },
    },
    apply: () => {
      if (existsSync(jobDir(jobId))) {
        throw new AutomationJobStateError(
          `Automation job '${jobId}' already exists.`,
          "AUTOMATION_JOB_EXISTS",
        );
      }
      writeSpec(spec);
      writeState(jobId, state);
      return jobId;
    },
  });

  return summarize(spec, state);
}

export function listAutomationJobs(): AutomationJobSummary[] {
  return jobIdsFromFs().flatMap((jobId) => {
    try {
      const detail = safeLoadDetail(jobId);
      return [summarize(detail.spec, detail.state)];
    } catch (error) {
      if (error instanceof AutomationJobCorruptedError) {
        return [];
      }
      throw error;
    }
  });
}

export function getAutomationJob(jobId: string): AutomationJobDetail {
  if (!existsSync(jobDir(jobId))) throw new AutomationJobNotFoundError(jobId);
  return safeLoadDetail(jobId);
}

function updateJobState(
  jobId: string,
  eventType: string,
  eventSummary: string,
  apply: (detail: AutomationJobDetail) => {
    state: AutomationJobState;
    historyEntry?: AutomationHistoryEntry;
    payload?: Record<string, unknown>;
  },
): AutomationJobDetail {
  let finalDetail: AutomationJobDetail | null = null;
  mutateWithEvent({
    paths: [statePath(jobId), historyPath(jobId)],
    event: (result) => ({
      type: eventType,
      entity: { kind: "automation-job", id: jobId },
      result: "success",
      summary: eventSummary,
      payload: result.payload,
    }),
    apply: () => {
      const detail = safeLoadDetail(jobId);
      const updated = apply(detail);
      writeState(jobId, updated.state);
      if (updated.historyEntry) {
        appendHistory(jobId, updated.historyEntry);
      }
      finalDetail = {
        ...detail,
        state: updated.state,
        history: updated.historyEntry ? [...detail.history, updated.historyEntry] : detail.history,
      };
      return {
        payload: updated.payload ?? {},
      };
    },
  });
  if (!finalDetail) {
    throw new AutomationJobStateError(`Failed to update automation job '${jobId}'.`);
  }
  return finalDetail;
}

export function pauseAutomationJob(jobId: string): AutomationJobSummary {
  const detail = updateJobState(
    jobId,
    "automation.pause",
    `Paused automation job ${jobId}.`,
    (current) => ({
      state: AutomationJobStateSchema.parse({
        ...current.state,
        status: "paused",
        nextRunAt: null,
        lease: null,
        updatedAt: nowIso(),
      }),
    }),
  );
  return summarize(detail.spec, detail.state);
}

export function resumeAutomationJob(jobId: string): AutomationJobSummary {
  const detail = updateJobState(
    jobId,
    "automation.resume",
    `Resumed automation job ${jobId}.`,
    (current) => {
      const resumedAt = nowIso();
      const nextRunAt = computeNextRunAt(current.spec.schedule, new Date());
      return {
        state: AutomationJobStateSchema.parse({
          ...current.state,
          status: nextRunAt === null ? "completed" : "scheduled",
          nextRunAt,
          lease: null,
          updatedAt: resumedAt,
        }),
        payload: { nextRunAt },
      };
    },
  );
  return summarize(detail.spec, detail.state);
}

export function removeAutomationJob(jobId: string): boolean {
  if (!existsSync(jobDir(jobId))) return false;
  mutateWithEvent({
    paths: [specPath(jobId), statePath(jobId), historyPath(jobId)],
    event: {
      type: "automation.remove",
      entity: { kind: "automation-job", id: jobId },
      result: "success",
      summary: `Removed automation job ${jobId}.`,
    },
    apply: () => {
      rmSync(jobDir(jobId), { recursive: true, force: true });
      return true;
    },
  });
  return true;
}

export interface ClaimedAutomationJob {
  spec: AutomationJobSpec;
  state: AutomationJobState;
  runId: string;
}

interface ClaimAutomationJobParams {
  ownerId: string;
  actor: AutomationActor;
  leaseMs?: number;
  now?: Date;
}

function claimJob(jobId: string, params: ClaimAutomationJobParams): ClaimedAutomationJob {
  const now = params.now ?? new Date();
  const leaseMs = params.leaseMs ?? DEFAULT_LEASE_MS;
  let claimed: ClaimedAutomationJob | null = null;

  updateJobState(jobId, "automation.run.start", `Started automation job ${jobId}.`, (detail) => {
    if (detail.state.status === "running") {
      throw new AutomationJobStateError(
        `Automation job '${jobId}' is already running.`,
        "AUTOMATION_JOB_ALREADY_RUNNING",
      );
    }
    if (detail.state.status === "paused" || detail.state.status === "blocked") {
      throw new AutomationJobStateError(
        `Automation job '${jobId}' must be resumed before it can run.`,
        "AUTOMATION_JOB_NOT_RUNNABLE",
      );
    }

    assertNoConcurrentExecution(detail.spec, detail.spec.jobId);
    const runId = createRunId();
    const updatedAt = nowIso();
    const state = AutomationJobStateSchema.parse({
      ...detail.state,
      status: "running",
      lease: {
        ownerId: params.ownerId,
        acquiredAt: updatedAt,
        expiresAt: new Date(now.getTime() + leaseMs).toISOString(),
      },
      lastRunId: runId,
      lastStartedAt: updatedAt,
      lastFinishedAt: null,
      lastError: null,
      lastErrorCode: null,
      updatedAt,
    });
    claimed = { spec: detail.spec, state, runId };
    return {
      state,
      payload: {
        kind: detail.spec.kind,
        runId,
        executionKey: detail.spec.executionKey,
        actor: AutomationActorSchema.parse(params.actor),
      },
    };
  });

  if (!claimed) {
    throw new AutomationJobStateError(`Failed to claim automation job '${jobId}'.`);
  }
  return claimed;
}

export function claimAutomationJob(
  jobId: string,
  params: ClaimAutomationJobParams,
): ClaimedAutomationJob {
  return claimJob(jobId, params);
}

export function claimNextDueAutomationJob(
  params: ClaimAutomationJobParams,
): ClaimedAutomationJob | null {
  const now = params.now ?? new Date();
  const dueJobs = listAutomationJobs()
    .filter(
      (job) =>
        job.status === "scheduled" && job.nextRunAt && Date.parse(job.nextRunAt) <= now.getTime(),
    )
    .sort(
      (left, right) =>
        Date.parse(left.nextRunAt ?? left.updatedAt) -
        Date.parse(right.nextRunAt ?? right.updatedAt),
    );

  for (const summary of dueJobs) {
    try {
      return claimJob(summary.jobId, params);
    } catch (error) {
      if (
        error instanceof AutomationJobStateError &&
        error.code === "AUTOMATION_EXECUTION_CONFLICT"
      ) {
        continue;
      }
      throw error;
    }
  }
  return null;
}

function finalizeJob(
  jobId: string,
  record: AutomationRunRecord,
  historyStatus: "success" | "failure" | "reconciled",
): AutomationJobDetail {
  return updateJobState(
    jobId,
    record.status === "completed" ? "automation.run.complete" : "automation.run.fail",
    `${record.status === "completed" ? "Completed" : "Failed"} automation job ${jobId}.`,
    (detail) => {
      if (detail.state.lastRunId !== record.runId) {
        throw new AutomationJobStateError(
          `Automation job '${jobId}' expected run '${detail.state.lastRunId}' but received '${record.runId}'.`,
          "AUTOMATION_RUN_MISMATCH",
        );
      }
      const finishedAt = record.finishedAt;
      const nextRunAt =
        record.status === "completed"
          ? computeNextRunAt(detail.spec.schedule, new Date(finishedAt))
          : detail.state.consecutiveFailures + 1 >= MAX_CONSECUTIVE_FAILURES
            ? null
            : new Date(
                Date.parse(finishedAt) + nextBackoffMs(detail.state.consecutiveFailures + 1),
              ).toISOString();
      const nextStatus =
        record.status === "completed"
          ? nextRunAt
            ? "scheduled"
            : "completed"
          : detail.state.consecutiveFailures + 1 >= MAX_CONSECUTIVE_FAILURES
            ? "blocked"
            : "scheduled";
      const state = AutomationJobStateSchema.parse({
        ...detail.state,
        status: nextStatus,
        nextRunAt,
        lastFinishedAt: finishedAt,
        lastSuccessAt: record.status === "completed" ? finishedAt : detail.state.lastSuccessAt,
        consecutiveFailures:
          record.status === "completed" ? 0 : detail.state.consecutiveFailures + 1,
        lastError: record.error ?? null,
        lastErrorCode: record.errorCode ?? null,
        lease: null,
        updatedAt: finishedAt,
      });
      const historyEntry = AutomationHistoryEntrySchema.parse({
        runId: record.runId,
        status: historyStatus,
        startedAt: record.startedAt,
        finishedAt,
        summary: record.summary,
        error: record.error,
        errorCode: record.errorCode,
        nextRunAt,
        artifactPaths: record.artifactPaths,
      });
      return {
        state,
        historyEntry,
        payload: {
          runId: record.runId,
          nextRunAt,
          status: record.status,
          kind: detail.spec.kind,
        },
      };
    },
  );
}

export function completeAutomationJob(record: AutomationRunRecord): AutomationJobDetail {
  const parsed = AutomationRunRecordSchema.parse(record);
  if (parsed.status !== "completed") {
    throw new AutomationJobStateError(
      "completeAutomationJob expected a completed run record.",
      "AUTOMATION_RUN_INVALID",
    );
  }
  return finalizeJob(parsed.jobId, parsed, "success");
}

export function failAutomationJob(record: AutomationRunRecord): AutomationJobDetail {
  const parsed = AutomationRunRecordSchema.parse(record);
  if (parsed.status !== "failed") {
    throw new AutomationJobStateError(
      "failAutomationJob expected a failed run record.",
      "AUTOMATION_RUN_INVALID",
    );
  }
  return finalizeJob(parsed.jobId, parsed, "failure");
}

export function reconcileAutomationJob(
  jobId: string,
  record?: AutomationRunRecord,
): AutomationJobDetail {
  const detail = safeLoadDetail(jobId);
  if (detail.state.status !== "running" || !detail.state.lastRunId) {
    return detail;
  }
  if (record) {
    return finalizeJob(jobId, AutomationRunRecordSchema.parse(record), "reconciled");
  }
  const failedAt = nowIso();
  return finalizeJob(
    jobId,
    AutomationRunRecordSchema.parse({
      jobId,
      runId: detail.state.lastRunId,
      kind: detail.spec.kind,
      executionKey: detail.spec.executionKey,
      actor: detail.spec.actor,
      status: "failed",
      startedAt: detail.state.lastStartedAt ?? failedAt,
      finishedAt: failedAt,
      summary: `Recovered stale automation lease for ${jobId}.`,
      error: "Stale automation lease recovered without a persisted run result.",
      errorCode: "AUTOMATION_STALE_LEASE",
      artifactPaths: [],
    }),
    "reconciled",
  );
}

export function recoverExpiredAutomationJobs(now = new Date()): AutomationJobSummary[] {
  const recovered: AutomationJobSummary[] = [];
  for (const jobId of jobIdsFromFs()) {
    let detail: AutomationJobDetail;
    try {
      detail = safeLoadDetail(jobId);
    } catch (error) {
      if (error instanceof AutomationJobCorruptedError) {
        continue;
      }
      throw error;
    }
    if (
      detail.state.status !== "running" ||
      !detail.state.lease ||
      Date.parse(detail.state.lease.expiresAt) > now.getTime()
    ) {
      continue;
    }
    const outputDir = outputDirForSpec(detail.spec);
    const runRecordPath = currentRunRecordPath(detail.state.lastRunId ?? "", outputDir);
    let record: AutomationRunRecord | undefined;
    if (detail.state.lastRunId && existsSync(runRecordPath)) {
      try {
        record = AutomationRunRecordSchema.parse(
          JSON.parse(readFileSync(runRecordPath, "utf-8")) as unknown,
        );
      } catch {
        record = undefined;
      }
    }
    const reconciled = reconcileAutomationJob(jobId, record);
    recovered.push(summarize(reconciled.spec, reconciled.state));
  }
  return recovered;
}

export interface AutomationDaemonLock {
  ownerId: string;
  release: () => void;
}

export function acquireAutomationDaemonLock(ownerId: string): AutomationDaemonLock {
  ensureDir(dirname(DAEMON_LOCK_PATH));
  if (existsSync(DAEMON_LOCK_PATH)) {
    try {
      const payload = JSON.parse(readFileSync(DAEMON_LOCK_PATH, "utf-8")) as DaemonLockPayload;
      if (payload.pid && daemonLockAlive(payload.pid)) {
        throw new AutomationDaemonLockError(
          `Automation daemon is already running under '${payload.ownerId}'.`,
        );
      }
      rmSync(DAEMON_LOCK_PATH, { force: true });
    } catch (error) {
      if (error instanceof AutomationDaemonLockError) throw error;
      rmSync(DAEMON_LOCK_PATH, { force: true });
    }
  }

  try {
    const fd = openSync(DAEMON_LOCK_PATH, "wx", 0o600);
    try {
      const payload: DaemonLockPayload = {
        ownerId,
        pid: process.pid,
        acquiredAt: nowIso(),
      };
      writeFileSync(fd, JSON.stringify(payload, null, 2));
    } finally {
      closeSync(fd);
    }
  } catch {
    throw new AutomationDaemonLockError(
      `Automation daemon lock '${DAEMON_LOCK_PATH}' is already held.`,
    );
  }

  return {
    ownerId,
    release: () => {
      rmSync(DAEMON_LOCK_PATH, { force: true });
    },
  };
}

export function getAutomationDaemonLockPath(): string {
  return DAEMON_LOCK_PATH;
}

import { closeSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { ServiceError } from "../errors.js";
import { CONFIG_DIR } from "../types/config.js";
import {
  type EventLogAppendInput,
  EventLogAppendInputSchema,
  type EventLogEntry,
  EventLogEntrySchema,
  type EventLogQueryInput,
  EventLogQueryInputSchema,
  type EventLogQueryResult,
  EventLogQueryResultSchema,
  type EventLogReadInput,
  EventLogReadInputSchema,
} from "../types/event-log.js";
import {
  appendTextFile,
  ensureDir,
  restoreFileSnapshots,
  snapshotFiles,
} from "../utils/file-store.js";

const DEFAULT_EVENT_LOG_PATH = join(CONFIG_DIR, "events.jsonl");
const LOCK_TIMEOUT_MS = 250;
const LOCK_RETRY_MS = 10;

function resolveEventLogPath(): string {
  return process.env.TONQUANT_EVENT_LOG_PATH || DEFAULT_EVENT_LOG_PATH;
}

function resolveLockPath(): string {
  return `${resolveEventLogPath()}.lock`;
}

function busyWait(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // busy wait keeps the implementation dependency-free for the first pass
  }
}

function acquireWriteLock(): () => void {
  const lockPath = resolveLockPath();
  ensureDir(dirname(lockPath));

  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (Date.now() <= deadline) {
    try {
      const fd = openSync(lockPath, "wx", 0o600);
      writeFileSync(fd, `${process.pid}:${Date.now()}`);
      closeSync(fd);
      return () => {
        rmSync(lockPath, { force: true });
      };
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") {
        throw new EventLogLockError("Unable to acquire event log lock.");
      }
      busyWait(LOCK_RETRY_MS);
    }
  }

  throw new EventLogLockError("Timed out waiting for event log lock.");
}

function readAllEntriesUnsafe(): EventLogEntry[] {
  const logPath = resolveEventLogPath();
  ensureDir(dirname(logPath));
  try {
    const raw = readFileSync(logPath, "utf-8");
    if (!raw.trim()) return [];
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line, idx) => {
        try {
          return EventLogEntrySchema.parse(JSON.parse(line));
        } catch {
          throw new EventLogCorruptedError(
            `Event log is corrupted at line ${idx + 1}. Delete ${basename(logPath)} to reset.`,
          );
        }
      });
  } catch (error) {
    if (error instanceof EventLogCorruptedError) throw error;
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

function matchesFilters(
  entry: EventLogEntry,
  filters: Pick<EventLogReadInput, "type" | "entityKind" | "entityId">,
): boolean {
  if (filters.type && entry.type !== filters.type) return false;
  if (filters.entityKind && entry.entity.kind !== filters.entityKind) return false;
  if (filters.entityId && entry.entity.id !== filters.entityId) return false;
  return true;
}

function appendEventUnsafe(input: EventLogAppendInput): EventLogEntry {
  if (process.env.TONQUANT_EVENT_LOG_FAIL_APPEND === "1") {
    throw new EventLogWriteError("Injected event log append failure.");
  }

  const parsed = EventLogAppendInputSchema.parse(input);
  const entries = readAllEntriesUnsafe();
  const entry: EventLogEntry = {
    seq: (entries.at(-1)?.seq ?? 0) + 1,
    ts: Date.now(),
    ...parsed,
  };
  appendTextFile(resolveEventLogPath(), `${JSON.stringify(entry)}\n`);
  return entry;
}

export class EventLogWriteError extends ServiceError {
  constructor(message: string) {
    super(message, "EVENT_LOG_WRITE_FAILED");
    this.name = "EventLogWriteError";
  }
}

export class EventLogCorruptedError extends ServiceError {
  constructor(message: string) {
    super(message, "EVENT_LOG_CORRUPTED");
    this.name = "EventLogCorruptedError";
  }
}

export class EventLogLockError extends ServiceError {
  constructor(message: string) {
    super(message, "EVENT_LOG_LOCKED");
    this.name = "EventLogLockError";
  }
}

export class EventLogRollbackError extends ServiceError {
  constructor(message: string) {
    super(message, "EVENT_LOG_ROLLBACK_FAILED");
    this.name = "EventLogRollbackError";
  }
}

export function appendEvent(input: EventLogAppendInput): EventLogEntry {
  const release = acquireWriteLock();
  try {
    return appendEventUnsafe(input);
  } catch (error) {
    if (
      error instanceof EventLogWriteError ||
      error instanceof EventLogCorruptedError ||
      error instanceof EventLogLockError
    ) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new EventLogWriteError(message);
  } finally {
    release();
  }
}

export function readEvents(input: EventLogReadInput = {}): EventLogEntry[] {
  const parsed = EventLogReadInputSchema.parse(input);
  const entries = readAllEntriesUnsafe().filter(
    (entry) => entry.seq > parsed.afterSeq && matchesFilters(entry, parsed),
  );
  return parsed.limit ? entries.slice(0, parsed.limit) : entries;
}

export function queryEvents(input: EventLogQueryInput = {}): EventLogQueryResult {
  const parsed = EventLogQueryInputSchema.parse(input);
  const filtered = readAllEntriesUnsafe()
    .filter((entry) => matchesFilters(entry, parsed))
    .sort((a, b) => b.seq - a.seq);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / parsed.pageSize));
  const start = (parsed.page - 1) * parsed.pageSize;

  return EventLogQueryResultSchema.parse({
    entries: filtered.slice(start, start + parsed.pageSize),
    total,
    page: parsed.page,
    pageSize: parsed.pageSize,
    totalPages,
  });
}

export function mutateWithEvent<T>(options: {
  paths: ReadonlyArray<string>;
  event: EventLogAppendInput | ((result: T) => EventLogAppendInput | null);
  apply: () => T;
}): T {
  const release = acquireWriteLock();
  const snapshots = snapshotFiles(options.paths);
  try {
    const result = options.apply();
    const event = typeof options.event === "function" ? options.event(result) : options.event;
    if (event) {
      appendEventUnsafe(event);
    }
    return result;
  } catch (error) {
    try {
      restoreFileSnapshots(snapshots);
    } catch (rollbackError) {
      const message =
        rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      throw new EventLogRollbackError(message);
    }

    if (
      error instanceof ServiceError ||
      error instanceof EventLogWriteError ||
      error instanceof EventLogCorruptedError ||
      error instanceof EventLogLockError
    ) {
      throw error;
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error(String(error));
  } finally {
    release();
  }
}

export const EVENT_LOG_PATH = DEFAULT_EVENT_LOG_PATH;

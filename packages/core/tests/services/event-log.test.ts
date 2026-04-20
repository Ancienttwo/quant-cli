import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  appendEvent,
  EventLogCorruptedError,
  EventLogLockError,
  EventLogWriteError,
  queryEvents,
  readEvents,
} from "../../src/services/event-log.js";

const TEST_ROOT = join(process.env.HOME ?? "/tmp", ".tonquant", "test-event-log");
const EVENT_LOG_PATH = join(TEST_ROOT, "events.jsonl");
const LOCK_PATH = `${EVENT_LOG_PATH}.lock`;

function resetEventLogEnv(): void {
  process.env.TONQUANT_EVENT_LOG_PATH = EVENT_LOG_PATH;
  delete process.env.TONQUANT_EVENT_LOG_FAIL_APPEND;
}

function clearEventArtifacts(): void {
  rmSync(TEST_ROOT, { recursive: true, force: true });
  rmSync(LOCK_PATH, { force: true });
}

describe("event log service", () => {
  beforeEach(() => {
    resetEventLogEnv();
    clearEventArtifacts();
  });

  afterEach(() => {
    delete process.env.TONQUANT_EVENT_LOG_PATH;
    delete process.env.TONQUANT_EVENT_LOG_FAIL_APPEND;
    clearEventArtifacts();
  });

  it("appends events with incrementing sequence numbers", () => {
    const first = appendEvent({
      type: "factor.publish",
      entity: { kind: "factor", id: "mom_30d" },
      result: "success",
      summary: "Published factor mom_30d.",
    });
    const second = appendEvent({
      type: "factor.subscribe",
      entity: { kind: "factor", id: "mom_30d" },
      result: "success",
      summary: "Subscribed to factor mom_30d.",
    });

    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect(readEvents().map((entry) => entry.seq)).toEqual([1, 2]);
  });

  it("returns empty results when the log file is missing", () => {
    expect(readEvents()).toEqual([]);
    expect(queryEvents()).toEqual({
      entries: [],
      total: 0,
      page: 1,
      pageSize: 100,
      totalPages: 1,
    });
  });

  it("supports pagination in descending sequence order", () => {
    for (const id of ["aaa", "bbb", "ccc"]) {
      appendEvent({
        type: "factor.publish",
        entity: { kind: "factor", id },
        result: "success",
        summary: `Published ${id}.`,
      });
    }

    const pageOne = queryEvents({ page: 1, pageSize: 2 });
    const pageTwo = queryEvents({ page: 2, pageSize: 2 });

    expect(pageOne.entries.map((entry) => entry.entity.id)).toEqual(["ccc", "bbb"]);
    expect(pageTwo.entries.map((entry) => entry.entity.id)).toEqual(["aaa"]);
    expect(pageOne.totalPages).toBe(2);
  });

  it("supports incremental reads with afterSeq and limit", () => {
    for (const id of ["aaa", "bbb", "ccc"]) {
      appendEvent({
        type: "factor.publish",
        entity: { kind: "factor", id },
        result: "success",
        summary: `Published ${id}.`,
      });
    }

    const incremental = readEvents({ afterSeq: 1, limit: 1 });

    expect(incremental.length).toBe(1);
    expect(incremental[0]?.seq).toBe(2);
  });

  it("filters by type and entity fields", () => {
    appendEvent({
      type: "factor.publish",
      entity: { kind: "factor", id: "mom_30d" },
      result: "success",
      summary: "Published factor.",
    });
    appendEvent({
      type: "factor.compose.save",
      entity: { kind: "composite", id: "blend_1" },
      result: "success",
      summary: "Saved composite.",
    });

    expect(readEvents({ type: "factor.publish" }).length).toBe(1);
    expect(readEvents({ entityKind: "composite" })[0]?.entity.id).toBe("blend_1");
    expect(queryEvents({ entityId: "mom_30d" }).entries.length).toBe(1);
  });

  it("creates parent directories when appending to a nested path", () => {
    process.env.TONQUANT_EVENT_LOG_PATH = join(TEST_ROOT, "nested", "events.jsonl");

    appendEvent({
      type: "factor.publish",
      entity: { kind: "factor", id: "nested_factor" },
      result: "success",
      summary: "Published nested factor.",
    });

    expect(readEvents().length).toBe(1);
  });

  it("fails loudly on corrupted log lines", () => {
    mkdirSync(TEST_ROOT, { recursive: true });
    writeFileSync(EVENT_LOG_PATH, '{"seq":1}\nnot-json\n', "utf-8");

    expect(() => readEvents()).toThrow(EventLogCorruptedError);
    expect(() =>
      appendEvent({
        type: "factor.publish",
        entity: { kind: "factor", id: "mom_30d" },
        result: "success",
        summary: "Published factor.",
      }),
    ).toThrow(EventLogCorruptedError);
  });

  it("surfaces append failures with a stable error code", () => {
    process.env.TONQUANT_EVENT_LOG_FAIL_APPEND = "1";

    expect(() =>
      appendEvent({
        type: "factor.publish",
        entity: { kind: "factor", id: "mom_30d" },
        result: "success",
        summary: "Published factor.",
      }),
    ).toThrow(EventLogWriteError);
  });

  it("rejects writes while a lock file is held by another process", () => {
    mkdirSync(TEST_ROOT, { recursive: true });
    writeFileSync(LOCK_PATH, "123:456", "utf-8");

    expect(() =>
      appendEvent({
        type: "factor.publish",
        entity: { kind: "factor", id: "mom_30d" },
        result: "success",
        summary: "Published factor.",
      }),
    ).toThrow(EventLogLockError);
  });
});

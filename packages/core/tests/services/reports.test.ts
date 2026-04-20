import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { readEvents } from "../../src/services/event-log.js";
import { FactorNotFoundError, publishFactor } from "../../src/services/registry.js";
import { listReports, submitReport } from "../../src/services/reports.js";
import { makeFactor } from "../helpers/factor-fixtures.js";

const REPORTS_PATH = join(process.env.HOME ?? "/tmp", ".tonquant", "reports.json");
const EVENT_LOG_PATH = join(process.env.HOME ?? "/tmp", ".tonquant", "test-report-events.jsonl");
const EVENT_LOG_LOCK_PATH = `${EVENT_LOG_PATH}.lock`;

function resetEventLogEnv(): void {
  process.env.TONQUANT_EVENT_LOG_PATH = EVENT_LOG_PATH;
  delete process.env.TONQUANT_EVENT_LOG_FAIL_APPEND;
}

function clearEventArtifacts(): void {
  if (existsSync(EVENT_LOG_PATH)) rmSync(EVENT_LOG_PATH);
  if (existsSync(EVENT_LOG_LOCK_PATH)) rmSync(EVENT_LOG_LOCK_PATH);
}

describe("report service", () => {
  beforeEach(() => {
    resetEventLogEnv();
    clearEventArtifacts();
    if (existsSync(REPORTS_PATH)) rmSync(REPORTS_PATH);
    publishFactor(makeFactor("report_test_factor"), { force: true });
    clearEventArtifacts();
  });

  afterEach(() => {
    if (existsSync(REPORTS_PATH)) rmSync(REPORTS_PATH);
    clearEventArtifacts();
    delete process.env.TONQUANT_EVENT_LOG_PATH;
    delete process.env.TONQUANT_EVENT_LOG_FAIL_APPEND;
  });

  it("submits a performance report", () => {
    const report = submitReport("report_test_factor", 15.5, "30d", "agent_001");
    expect(report.factorId).toBe("report_test_factor");
    expect(report.returnPct).toBe(15.5);
    expect(report.period).toBe("30d");
    expect(report.agentId).toBe("agent_001");
    expect(report.verified).toBe(false);
  });

  it("defaults agentId to anonymous", () => {
    const report = submitReport("report_test_factor", 10.0, "7d");
    expect(report.agentId).toBe("anonymous");
  });

  it("appends an audit event when a report is submitted", () => {
    submitReport("report_test_factor", 15.5, "30d", "agent_001");

    const events = readEvents({ type: "factor.report.submit" });
    expect(events.length).toBe(1);
    expect(events[0]?.entity.id).toBe("report_test_factor");
  });

  it("rolls back report writes when event append fails", () => {
    process.env.TONQUANT_EVENT_LOG_FAIL_APPEND = "1";

    expect(() => submitReport("report_test_factor", 10.0, "7d")).toThrow(
      "Injected event log append failure.",
    );
    expect(listReports()).toEqual([]);
    expect(readEvents()).toEqual([]);
  });

  it("throws for nonexistent factor", () => {
    expect(() => submitReport("nonexistent_xyz", 10.0, "7d")).toThrow(FactorNotFoundError);
  });

  it("appends multiple reports for same factor", () => {
    submitReport("report_test_factor", 10.0, "7d", "agent_a");
    submitReport("report_test_factor", 20.0, "30d", "agent_b");
    const reports = listReports("report_test_factor");
    expect(reports.length).toBe(2);
  });

  it("lists all reports without filter", () => {
    submitReport("report_test_factor", 10.0, "7d");
    const all = listReports();
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it("filters reports by factorId", () => {
    submitReport("report_test_factor", 10.0, "7d");
    const filtered = listReports("report_test_factor");
    expect(filtered.every((r) => r.factorId === "report_test_factor")).toBe(true);
    const empty = listReports("other_factor");
    expect(empty.length).toBe(0);
  });

  it("returns empty array when no reports file", () => {
    const reports = listReports();
    expect(Array.isArray(reports)).toBe(true);
  });
});

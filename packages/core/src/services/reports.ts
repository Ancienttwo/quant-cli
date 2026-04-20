import { join } from "node:path";
import { ServiceError } from "../errors.js";
import { CONFIG_DIR } from "../types/config.js";
import {
  type FactorPerformanceReport,
  FactorPerformanceReportSchema,
  ReportsFileSchema,
} from "../types/factor-registry.js";
import { readJsonFile, writeJsonFileAtomic } from "../utils/file-store.js";
import { mutateWithEvent } from "./event-log.js";
import { getFactorDetail } from "./registry.js";

// ── Constants ──────────────────────────────────────────────
const REPORTS_PATH = join(CONFIG_DIR, "reports.json");
const MAX_REPORTS = 1000;

// ── Error subclasses ───────────────────────────────────────
export class ReportValidationError extends ServiceError {
  constructor(message: string) {
    super(message, "REPORT_VALIDATION");
    this.name = "ReportValidationError";
  }
}

// ── IO helpers ─────────────────────────────────────────────

function readReports(): FactorPerformanceReport[] {
  return readJsonFile<{ reports: FactorPerformanceReport[] }>(REPORTS_PATH, ReportsFileSchema, {
    defaultValue: { reports: [] },
    corruptedCode: "REPORTS_CORRUPTED",
    corruptedMessage: `reports.json is corrupted. Delete ${REPORTS_PATH} to reset.`,
  }).reports;
}

function writeReports(reports: ReadonlyArray<FactorPerformanceReport>): void {
  writeJsonFileAtomic(REPORTS_PATH, { reports });
}

// ── Public API ─────────────────────────────────────────────

export function submitReport(
  factorId: string,
  returnPct: number,
  period: string,
  agentId?: string,
): FactorPerformanceReport {
  return mutateWithEvent({
    paths: [REPORTS_PATH],
    event: (report) => ({
      type: "factor.report.submit",
      entity: { kind: "factor", id: factorId },
      result: "success",
      summary: `Submitted ${period} report for factor ${factorId}.`,
      payload: {
        agentId: report.agentId,
        period,
        returnPct,
      },
    }),
    apply: () => {
      getFactorDetail(factorId);

      const report = FactorPerformanceReportSchema.parse({
        factorId,
        agentId: agentId ?? "anonymous",
        returnPct,
        period,
        reportedAt: new Date().toISOString(),
        verified: false,
      });

      const existing = readReports();
      const trimmed =
        existing.length >= MAX_REPORTS
          ? existing.slice(existing.length - MAX_REPORTS + 1)
          : existing;

      writeReports([...trimmed, report]);
      return report;
    },
  });
}

export function listReports(factorId?: string): FactorPerformanceReport[] {
  const all = readReports();
  if (!factorId) return all;
  return all.filter((r) => r.factorId === factorId);
}

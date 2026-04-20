import { listReports, submitReport } from "@tonquant/core";
import type { Command } from "commander";
import { formatFactorReport, formatFactorReportList } from "../utils/format-marketplace.js";
import { handleCommand } from "../utils/output.js";

// ── Command registration ─────────────────────────────────────

export function registerFactorReportCommands(factor: Command): void {
  // ── report-submit ──
  factor
    .command("report-submit <factorId>")
    .description("Submit a performance report for a factor")
    .requiredOption("--return <pct>", "Return percentage", parseFloat)
    .requiredOption("--period <period>", "Reporting period (e.g. 7d, 30d, 90d)")
    .option("--agent-id <id>", "Agent identifier")
    .action(async (factorId: string, opts) => {
      const json = factor.parent?.opts().json ?? false;
      await handleCommand(
        { json },
        async () => submitReport(factorId, opts.return, opts.period, opts.agentId),
        formatFactorReport,
      );
    });

  // ── report-list ──
  factor
    .command("report-list")
    .description("List performance reports")
    .option("--factor-id <id>", "Filter by factor ID")
    .action(async (opts) => {
      const json = factor.parent?.opts().json ?? false;
      await handleCommand({ json }, async () => listReports(opts.factorId), formatFactorReportList);
    });
}

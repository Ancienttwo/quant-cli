import { listAlerts, removeAlert, setAlert } from "@tonquant/core";
import chalk from "chalk";
import type { Command } from "commander";
import { formatFactorAlertList, formatFactorAlertSet } from "../utils/format-marketplace.js";
import { handleCommand } from "../utils/output.js";

// ── Command registration ─────────────────────────────────────

export function registerFactorAlertCommands(factor: Command): void {
  // ── alert-set ──
  factor
    .command("alert-set <factorId>")
    .description("Set a factor alert (above/below threshold)")
    .option(
      "--metric <metric>",
      "Metric: rankIcOosIcir|turnoverTwoWay|peerCorrelationMaxAbs",
      "rankIcOosIcir",
    )
    .requiredOption("--condition <condition>", "Trigger condition: above or below")
    .requiredOption("--threshold <n>", "Threshold value", parseFloat)
    .action(async (factorId: string, opts) => {
      const json = factor.parent?.opts().json ?? false;
      await handleCommand(
        { json },
        async () => {
          const condition = opts.condition as string;
          if (condition !== "above" && condition !== "below") {
            throw new Error(`Invalid condition '${condition}'. Use 'above' or 'below'.`);
          }
          const metric = opts.metric as string;
          if (
            metric !== "rankIcOosIcir" &&
            metric !== "turnoverTwoWay" &&
            metric !== "peerCorrelationMaxAbs"
          ) {
            throw new Error(
              `Invalid metric '${metric}'. Use rankIcOosIcir, turnoverTwoWay, or peerCorrelationMaxAbs.`,
            );
          }
          return setAlert(factorId, metric, condition, opts.threshold);
        },
        formatFactorAlertSet,
      );
    });

  // ── alert-list ──
  factor
    .command("alert-list")
    .description("List all factor alerts")
    .action(async () => {
      const json = factor.parent?.opts().json ?? false;
      await handleCommand({ json }, async () => listAlerts(), formatFactorAlertList);
    });

  // ── alert-remove ──
  factor
    .command("alert-remove <factorId>")
    .description("Remove all alerts for a factor")
    .action(async (factorId: string) => {
      const json = factor.parent?.opts().json ?? false;
      await handleCommand(
        { json },
        async () => {
          const removed = removeAlert(factorId);
          return { factorId, removed };
        },
        (r) =>
          r.removed
            ? `${chalk.yellow("Removed")} alerts for ${chalk.cyan(r.factorId)}`
            : `${chalk.dim("No alerts found")} for ${r.factorId}`,
      );
    });
}

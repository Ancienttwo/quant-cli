import { getFactorDetail, type LegacySignalMetaPublic, publishFactor } from "@tonquant/core";
import type { Command } from "commander";
import { runBacktest } from "../quant/api/backtest.js";
import { formatBacktest } from "../utils/format-quant.js";
import { handleCommand } from "../utils/output.js";
import { attachReceipt } from "../utils/receipts.js";

function defaultDateRange(): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end.getTime() - 90 * 86_400_000);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

// ── Command registration ─────────────────────────────────────

export async function runStoredFactorBacktest(
  factorId: string,
  opts: {
    startDate?: string;
    endDate?: string;
    symbols?: string;
    update?: boolean;
  },
) {
  const entry = getFactorDetail(factorId);
  const pub = entry.public;
  const dates = defaultDateRange();
  const symbols = opts.symbols
    ? opts.symbols.split(",").map((s: string) => s.trim())
    : pub.listingType === "factor"
      ? pub.definition.universe.assets.map((asset) =>
          asset.includes("/") ? asset : `${asset}/USDT`,
        )
      : pub.definition.assets.map((asset) => (asset.includes("/") ? asset : `${asset}/USDT`));

  const params: Record<string, string | number> = entry.private?.parameterValues
    ? (Object.fromEntries(
        Object.entries(entry.private.parameterValues).filter(
          ([, value]) => typeof value === "string" || typeof value === "number",
        ),
      ) as Record<string, string | number>)
    : {};

  const strategy = pub.category;
  const request = {
    strategy,
    params,
    symbols,
    startDate: opts.startDate ?? dates.startDate,
    endDate: opts.endDate ?? dates.endDate,
  };

  const result = await runBacktest(request);

  if (opts.update) {
    if (pub.listingType !== "legacy-signal") {
      throw new Error(
        "Updating marketplace factors from a strategy backtest is no longer supported. Re-run factor evaluate instead.",
      );
    }
    const now = new Date().toISOString();
    const updated: LegacySignalMetaPublic = {
      ...pub,
      updatedAt: now,
      referenceBacktest: {
        benchmark: undefined,
        netOrGross: "gross",
        costAssumptions: "Legacy signal backtest refreshed via tonquant signal backtest --update.",
        strategyMetrics: {
          arr: result.totalReturn,
          sharpe: result.sharpe,
          calmar: result.calmar,
          sortino: result.sortino,
          winRate: result.winRate,
          ytd: undefined,
          maxDrawdown: result.maxDrawdown,
        },
      },
    };
    publishFactor(updated, { force: true });
  }

  return result;
}

export function registerFactorBacktestCommands(factor: Command): void {
  factor
    .command("backtest <factorId>")
    .description("Run backtest for a registry factor")
    .option("--start-date <date>", "Start date (YYYY-MM-DD)")
    .option("--end-date <date>", "End date (YYYY-MM-DD)")
    .option("--symbols <symbols>", "Comma-separated symbols override")
    .option("--update", "Update the factor registry with new backtest results")
    .action(async (factorId: string, opts) => {
      const json = factor.parent?.opts().json ?? false;
      await handleCommand(
        { json },
        async () =>
          attachReceipt(await runStoredFactorBacktest(factorId, opts), {
            action: "signal.backtest.alias",
            target: factorId,
            warnings: [
              "`tonquant factor backtest` is now a compatibility alias. Use `tonquant signal backtest` for legacy single-instrument entries, or `tonquant factor evaluate` for marketplace factor validation.",
            ],
          }),
        formatBacktest,
      );
    });
}

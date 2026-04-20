import type { Command } from "commander";
import { runBacktest } from "../quant/api/backtest.js";
import type { AssetClass, MarketRegion, ProviderCode, VenueCode } from "../quant/types/index.js";
import { formatBacktest } from "../utils/format-quant.js";
import { handleCommand } from "../utils/output.js";

interface BacktestOptions {
  strategy: string;
  symbols?: string;
  datasetPath?: string;
  assetClass?: AssetClass;
  marketRegion?: MarketRegion;
  venue?: VenueCode;
  provider?: ProviderCode;
  startDate?: string;
  endDate?: string;
}

export function registerBacktestCommand(program: Command): void {
  const command = program.command("backtest").description("Quant strategy backtesting [Phase 1]");

  command
    .command("run")
    .description("Run a normalized quant backtest")
    .requiredOption("--strategy <strategy>", "Strategy id (e.g. momentum)")
    .option("--symbols <symbols>", "Comma-separated symbols")
    .option("--dataset-path <path>", "Use an existing normalized dataset file")
    .option("--asset-class <assetClass>", "Asset class: crypto|equity|bond", "crypto")
    .option("--market-region <marketRegion>", "Market region: ton|us|hk|cn", "ton")
    .option("--venue <venue>", "Venue override (stonfi|nyse|nasdaq|hkex|sse|szse|cibm)")
    .option(
      "--provider <provider>",
      "Provider override (okx|binance|hyperliquid|stonfi|tonapi|yfinance|openbb|synthetic)",
    )
    .option("--start-date <date>", "Start date (YYYY-MM-DD)")
    .option("--end-date <date>", "End date (YYYY-MM-DD)")
    .action(async (opts: BacktestOptions) => {
      const json = program.opts().json ?? false;
      const now = new Date();
      const start =
        opts.startDate ?? new Date(now.getTime() - 90 * 86400_000).toISOString().slice(0, 10);
      const end = opts.endDate ?? now.toISOString().slice(0, 10);
      const symbols = opts.symbols ? opts.symbols.split(",") : opts.datasetPath ? [] : ["TON/USDT"];
      await handleCommand(
        { json },
        () =>
          runBacktest({
            strategy: opts.strategy,
            symbols,
            datasetPath: opts.datasetPath,
            assetClass: opts.assetClass,
            marketRegion: opts.marketRegion,
            venue: opts.venue,
            provider: opts.provider,
            startDate: start,
            endDate: end,
          }),
        formatBacktest,
      );
    });
}

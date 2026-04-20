import type { Command } from "commander";
import { runFactorCompute, runFactorList } from "../quant/api/factor.js";
import type { AssetClass, MarketRegion, ProviderCode, VenueCode } from "../quant/types/index.js";
import { formatBacktest, formatFactorCompute, formatFactorList } from "../utils/format-quant.js";
import { handleCommand } from "../utils/output.js";
import { runStoredFactorBacktest } from "./factor-backtest.js";

interface SignalComputeOptions {
  signals: string;
  symbols?: string;
  datasetPath?: string;
  assetClass?: AssetClass;
  marketRegion?: MarketRegion;
  venue?: VenueCode;
  provider?: ProviderCode;
}

interface SignalBacktestOptions {
  startDate?: string;
  endDate?: string;
  symbols?: string;
  update?: boolean;
}

export function registerSignalCommand(program: Command): void {
  const command = program
    .command("signal")
    .description("Single-instrument signal research surface (legacy factor compute/backtest path)");

  command
    .command("list")
    .description("List available built-in signal indicators")
    .action(async () => {
      const json = program.opts().json ?? false;
      await handleCommand({ json }, () => runFactorList(), formatFactorList);
    });

  command
    .command("compute")
    .description("Compute single-instrument signal indicators on normalized data")
    .requiredOption("--signals <signals>", "Comma-separated signal IDs (rsi,macd,volatility)")
    .option("--symbols <symbols>", "Comma-separated symbols")
    .option("--dataset-path <path>", "Use an existing normalized dataset file")
    .option("--asset-class <assetClass>", "Asset class: crypto|equity|bond", "crypto")
    .option("--market-region <marketRegion>", "Market region: ton|us|hk|cn", "ton")
    .option("--venue <venue>", "Venue override (stonfi|nyse|nasdaq|hkex|sse|szse|cibm)")
    .option(
      "--provider <provider>",
      "Provider override (okx|binance|hyperliquid|stonfi|tonapi|yfinance|openbb|synthetic)",
    )
    .action(async (opts: SignalComputeOptions) => {
      const json = program.opts().json ?? false;
      const symbols = opts.symbols ? opts.symbols.split(",") : opts.datasetPath ? [] : ["TON/USDT"];
      await handleCommand(
        { json },
        () =>
          runFactorCompute({
            symbols,
            factors: opts.signals.split(","),
            datasetPath: opts.datasetPath,
            assetClass: opts.assetClass,
            marketRegion: opts.marketRegion,
            venue: opts.venue,
            provider: opts.provider,
          }),
        formatFactorCompute,
      );
    });

  command
    .command("backtest <signalId>")
    .description("Run the legacy single-instrument registry backtest path for a signal entry")
    .option("--start-date <date>", "Start date (YYYY-MM-DD)")
    .option("--end-date <date>", "End date (YYYY-MM-DD)")
    .option("--symbols <symbols>", "Comma-separated symbols override")
    .option("--update", "Update the legacy signal reference backtest metadata")
    .action(async (signalId: string, opts: SignalBacktestOptions) => {
      const json = program.opts().json ?? false;
      await handleCommand({ json }, () => runStoredFactorBacktest(signalId, opts), formatBacktest);
    });
}

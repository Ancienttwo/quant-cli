import type { Command } from "commander";
import { runDataFetch, runDataInfo, runDataList } from "../quant/api/data-fetch.js";
import type { AssetClass, MarketRegion, ProviderCode, VenueCode } from "../quant/types/index.js";
import { formatDataFetch, formatDataInfo, formatDataList } from "../utils/format-quant.js";
import { handleCommand } from "../utils/output.js";

interface MarketOptions {
  assetClass?: AssetClass;
  marketRegion?: MarketRegion;
  venue?: VenueCode;
  provider?: ProviderCode;
}

export function registerDataCommand(program: Command): void {
  const command = program.command("data").description("Quant dataset management [Phase 1]");

  command
    .command("fetch <symbols...>")
    .description("Fetch and cache normalized quant datasets")
    .option("--asset-class <assetClass>", "Asset class: crypto|equity|bond", "crypto")
    .option("--market-region <marketRegion>", "Market region: ton|us|hk|cn", "ton")
    .option("--venue <venue>", "Venue override (stonfi|nyse|nasdaq|hkex|sse|szse|cibm)")
    .option(
      "--provider <provider>",
      "Provider override (okx|binance|hyperliquid|stonfi|tonapi|yfinance|openbb|synthetic)",
    )
    .action(async (symbols: string[], opts: MarketOptions) => {
      const json = program.opts().json ?? false;
      await handleCommand(
        { json },
        () =>
          runDataFetch({
            symbols,
            assetClass: opts.assetClass,
            marketRegion: opts.marketRegion,
            venue: opts.venue,
            provider: opts.provider,
          }),
        formatDataFetch,
      );
    });

  command
    .command("list")
    .description("List cached quant datasets")
    .action(async () => {
      const json = program.opts().json ?? false;
      await handleCommand({ json }, () => runDataList(), formatDataList);
    });

  command
    .command("info <symbol>")
    .description("Show metadata for a cached quant dataset")
    .option("--asset-class <assetClass>", "Asset class: crypto|equity|bond", "crypto")
    .option("--market-region <marketRegion>", "Market region: ton|us|hk|cn", "ton")
    .option("--venue <venue>", "Venue override (stonfi|nyse|nasdaq|hkex|sse|szse|cibm)")
    .option(
      "--provider <provider>",
      "Provider override (okx|binance|hyperliquid|stonfi|tonapi|yfinance|openbb|synthetic)",
    )
    .action(async (symbol: string, opts: MarketOptions) => {
      const json = program.opts().json ?? false;
      await handleCommand(
        { json },
        () =>
          runDataInfo({
            symbol,
            assetClass: opts.assetClass,
            marketRegion: opts.marketRegion,
            venue: opts.venue,
            provider: opts.provider,
          }),
        formatDataInfo,
      );
    });
}

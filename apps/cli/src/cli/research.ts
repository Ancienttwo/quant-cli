import {
  fetchMarketCandlesData,
  fetchMarketCompareData,
  fetchMarketQuoteData,
  fetchMarketSearchData,
  fetchResearchData,
} from "@tonquant/core";
import type { Command } from "commander";
import type { MarketProvider } from "../types/cli.js";
import {
  formatMarketCandles,
  formatMarketCompare,
  formatMarketQuote,
  formatMarketSearch,
  formatResearch,
} from "../utils/format.js";
import { CliCommandError, handleCommand, printAndExit } from "../utils/output.js";

export const RESEARCH_ACTIONS = ["quote", "search", "compare", "candles", "liquidity"] as const;

function parseProvider(raw: string | undefined): MarketProvider | undefined {
  if (!raw) return undefined;
  if (raw === "okx" || raw === "binance" || raw === "hyperliquid") {
    return raw;
  }
  throw new CliCommandError(
    `Unsupported market provider '${raw}'. Expected 'okx', 'binance', or 'hyperliquid'.`,
    "MARKET_PROVIDER_INVALID",
  );
}

export function registerResearchCommand(program: Command): void {
  const research = program
    .command("research")
    .description("Unified research entrypoint for OKX-first global market data and TON support");

  research
    .command("quote <symbol>")
    .description("Quote a generic symbol from OKX-first public market data")
    .option("-p, --provider <provider>", "Provider (okx|binance|hyperliquid)")
    .action(async (symbol: string, options: { provider?: string }) => {
      const json = program.opts().json ?? false;
      await handleCommand(
        { json },
        () => fetchMarketQuoteData(symbol, parseProvider(options.provider)),
        formatMarketQuote,
      );
    });

  research
    .command("search <query>")
    .description("Search public-market instruments across supported providers")
    .option("-p, --provider <provider>", "Provider (okx|binance|hyperliquid)")
    .action(async (query: string, options: { provider?: string }) => {
      const json = program.opts().json ?? false;
      await handleCommand(
        { json },
        () => fetchMarketSearchData(query, parseProvider(options.provider)),
        formatMarketSearch,
      );
    });

  research
    .command("compare <symbol>")
    .description("Compare OKX-first quotes against Binance and Hyperliquid bridge/reference venues")
    .action(async (symbol: string) => {
      const json = program.opts().json ?? false;
      await handleCommand({ json }, () => fetchMarketCompareData(symbol), formatMarketCompare);
    });

  research
    .command("candles <symbol>")
    .description("Fetch public-market OHLCV candles for a generic symbol")
    .option("-p, --provider <provider>", "Provider (okx|binance|hyperliquid)")
    .option("-i, --interval <interval>", "Interval (15m|1h|4h|1d)", "1d")
    .option("-n, --limit <number>", "Number of candles to fetch", "30")
    .action(
      async (symbol: string, options: { provider?: string; interval: string; limit: string }) => {
        const json = program.opts().json ?? false;
        await handleCommand(
          { json },
          () =>
            fetchMarketCandlesData(symbol, {
              provider: parseProvider(options.provider),
              interval: options.interval,
              limit: Number.parseInt(options.limit, 10),
            }),
          formatMarketCandles,
        );
      },
    );

  research
    .command("liquidity <symbol>")
    .description(
      "Inspect TON liquidity, pools, and price context for a TON token (deprecated compatibility path)",
    )
    .action(async (symbol: string) => {
      const json = program.opts().json ?? false;
      await handleCommand({ json }, () => fetchResearchData(symbol), formatResearch);
    });

  research.action(() => {
    printAndExit(research.helpInformation(), 0);
  });
}

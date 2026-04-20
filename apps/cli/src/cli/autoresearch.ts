import type { Command } from "commander";
import {
  getAutoresearchTrack,
  initAutoresearchTrack,
  listAutoresearchTracks,
  promoteAutoresearchCandidate,
  rejectAutoresearchCandidate,
  runAutoresearchTrack,
} from "../quant/api/autoresearch.js";
import type { AssetClass, MarketRegion, ProviderCode, VenueCode } from "../quant/types/index.js";
import { formatAutoresearchList, formatAutoresearchResult } from "../utils/format-quant.js";
import { handleCommand } from "../utils/output.js";

interface AutoresearchInitOptions {
  title: string;
  strategy: string;
  symbols: string;
  startDate: string;
  endDate: string;
  assetClass?: AssetClass;
  marketRegion?: MarketRegion;
  venue?: VenueCode;
  provider?: ProviderCode;
  track?: string;
  thesis?: string;
}

export function registerAutoresearchCommand(program: Command): void {
  const command = program
    .command("autoresearch")
    .description("Quant autoresearch track management [Phase 1]");

  command
    .command("run")
    .description("Run a durable autoresearch iteration against an existing track")
    .requiredOption("--track <trackId>", "Track id")
    .option("--iterations <count>", "Number of iterations", "1")
    .action(async (opts: { track: string; iterations: string }) => {
      const json = program.opts().json ?? false;
      await handleCommand(
        { json },
        async () =>
          runAutoresearchTrack({
            trackId: opts.track,
            iterations: parseInt(opts.iterations, 10),
          }),
        formatAutoresearchResult,
      );
    });

  command
    .command("init")
    .description("Initialize a normalized quant autoresearch track")
    .requiredOption("--title <title>", "Track title")
    .requiredOption("--strategy <strategy>", "Strategy id")
    .requiredOption("--symbols <symbols>", "Comma-separated symbols")
    .requiredOption("--start-date <date>", "Start date (YYYY-MM-DD)")
    .requiredOption("--end-date <date>", "End date (YYYY-MM-DD)")
    .option("--asset-class <assetClass>", "Asset class: crypto|equity|bond", "crypto")
    .option("--market-region <marketRegion>", "Market region: ton|us|hk|cn", "ton")
    .option("--venue <venue>", "Venue override (stonfi|nyse|nasdaq|hkex|sse|szse|cibm)")
    .option(
      "--provider <provider>",
      "Provider override (okx|binance|hyperliquid|stonfi|tonapi|yfinance|openbb|synthetic)",
    )
    .option("--track <trackId>", "Optional explicit track id")
    .option("--thesis <text>", "Optional investment thesis")
    .action(async (opts: AutoresearchInitOptions) => {
      const json = program.opts().json ?? false;
      await handleCommand(
        { json },
        async () =>
          initAutoresearchTrack({
            trackId: opts.track,
            title: opts.title,
            thesis: opts.thesis,
            strategy: opts.strategy,
            assetClass: opts.assetClass,
            marketRegion: opts.marketRegion,
            venue: opts.venue,
            provider: opts.provider,
            symbols: opts.symbols.split(",").map((symbol) => symbol.trim()),
            startDate: opts.startDate,
            endDate: opts.endDate,
          }),
        formatAutoresearchResult,
      );
    });

  command
    .command("status")
    .description("Show a quant autoresearch track")
    .requiredOption("--track <trackId>", "Track id")
    .action(async (opts: { track: string }) => {
      const json = program.opts().json ?? false;
      await handleCommand(
        { json },
        async () => getAutoresearchTrack({ trackId: opts.track }),
        formatAutoresearchResult,
      );
    });

  command
    .command("list")
    .description("List quant autoresearch tracks")
    .action(async () => {
      const json = program.opts().json ?? false;
      await handleCommand({ json }, async () => listAutoresearchTracks(), formatAutoresearchList);
    });

  command
    .command("promote")
    .description("Promote an autoresearch candidate into the track baseline")
    .requiredOption("--track <trackId>", "Track id")
    .requiredOption("--candidate <candidateId>", "Candidate id")
    .action(async (opts: { track: string; candidate: string }) => {
      const json = program.opts().json ?? false;
      await handleCommand(
        { json },
        async () =>
          promoteAutoresearchCandidate({
            trackId: opts.track,
            candidateId: opts.candidate,
          }),
        formatAutoresearchResult,
      );
    });

  command
    .command("reject")
    .description("Reject an autoresearch candidate")
    .requiredOption("--track <trackId>", "Track id")
    .requiredOption("--candidate <candidateId>", "Candidate id")
    .action(async (opts: { track: string; candidate: string }) => {
      const json = program.opts().json ?? false;
      await handleCommand(
        { json },
        async () =>
          rejectAutoresearchCandidate({
            trackId: opts.track,
            candidateId: opts.candidate,
          }),
        formatAutoresearchResult,
      );
    });
}

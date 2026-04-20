import { type Command, InvalidArgumentError } from "commander";
import { runFactorCompute, runFactorEvaluate, runFactorList } from "../quant/api/factor.js";
import type { AssetClass, MarketRegion, ProviderCode, VenueCode } from "../quant/types/index.js";
import {
  formatFactorCompute,
  formatFactorEvaluate,
  formatFactorList,
} from "../utils/format-quant.js";
import { handleCommand } from "../utils/output.js";
import { attachReceipt } from "../utils/receipts.js";
import { registerFactorAlertCommands } from "./factor-alert.js";
import { registerFactorAuthorCommands } from "./factor-author.js";
import { registerFactorBacktestCommands } from "./factor-backtest.js";
import { registerFactorComposeCommands } from "./factor-compose.js";
import { registerFactorMarketplaceCommands } from "./factor-core.js";
import { registerFactorPlatformCommands } from "./factor-platform.js";
import { registerFactorPullCommands } from "./factor-pull.js";
import { registerFactorReportCommands } from "./factor-report.js";
import { registerFactorSeedCommands } from "./factor-seed.js";
import { registerFactorSkillCommands } from "./factor-skill.js";

interface FactorComputeOptions {
  factors: string;
  symbols?: string;
  datasetPath?: string;
  assetClass?: AssetClass;
  marketRegion?: MarketRegion;
  venue?: VenueCode;
  provider?: ProviderCode;
}

interface FactorEvaluateOptions {
  definitionFile: string;
  liquidityAssumptionsFile: string;
  costModelFile: string;
  symbols: string;
  assetClass?: AssetClass;
  marketRegion?: MarketRegion;
  venue?: VenueCode;
  provider?: ProviderCode;
  startDate?: string;
  endDate?: string;
  trainRatio?: string;
  validationRatio?: string;
  pointInTime?: boolean;
  survivorshipBiasControlled?: boolean;
  nTrials?: number;
  codeVersion?: string;
  output?: string;
}

function factorAliasWarning(command: string, replacement: string): string {
  return `\`tonquant factor ${command}\` is now a compatibility alias for the signal surface. Use \`tonquant ${replacement}\` for single-instrument indicator work.`;
}

function parsePositiveInteger(raw: string): number {
  if (!/^\d+$/u.test(raw.trim())) {
    throw new InvalidArgumentError("--n-trials must be a positive integer");
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError("--n-trials must be a positive integer");
  }

  return parsed;
}

export function registerFactorCommand(program: Command): void {
  const command = program.command("factor").description("Factor computation & marketplace");

  // Quant boundary commands (Phase 1)
  command
    .command("list")
    .description("List available quant factors")
    .action(async () => {
      const json = program.opts().json ?? false;
      await handleCommand({ json }, () => runFactorList(), formatFactorList);
    });

  command
    .command("compute")
    .description("Compatibility alias for single-instrument signal compute")
    .requiredOption("--factors <factors>", "Comma-separated factor IDs (rsi,macd,volatility)")
    .option("--symbols <symbols>", "Comma-separated symbols")
    .option("--dataset-path <path>", "Use an existing normalized dataset file")
    .option("--asset-class <assetClass>", "Asset class: crypto|equity|bond", "crypto")
    .option("--market-region <marketRegion>", "Market region: ton|us|hk|cn", "ton")
    .option("--venue <venue>", "Venue override (stonfi|nyse|nasdaq|hkex|sse|szse|cibm)")
    .option(
      "--provider <provider>",
      "Provider override (okx|binance|hyperliquid|stonfi|tonapi|yfinance|openbb|synthetic)",
    )
    .action(async (opts: FactorComputeOptions) => {
      const json = program.opts().json ?? false;
      const symbols = opts.symbols ? opts.symbols.split(",") : opts.datasetPath ? [] : ["TON/USDT"];
      await handleCommand(
        { json },
        async () =>
          attachReceipt(
            await runFactorCompute({
              symbols,
              factors: opts.factors.split(","),
              datasetPath: opts.datasetPath,
              assetClass: opts.assetClass,
              marketRegion: opts.marketRegion,
              venue: opts.venue,
              provider: opts.provider,
            }),
            {
              action: "signal.compute.alias",
              target: opts.factors,
              warnings: [factorAliasWarning("compute", "signal compute")],
            },
          ),
        formatFactorCompute,
      );
    });

  command
    .command("evaluate")
    .description("Evaluate a cross-sectional factor and emit factor-evaluation.json")
    .requiredOption("--definition-file <path>", "Factor definition JSON file")
    .requiredOption(
      "--liquidity-assumptions-file <path>",
      "Structured liquidity-assumptions JSON file",
    )
    .requiredOption("--cost-model-file <path>", "Structured cost-model JSON file")
    .requiredOption("--symbols <symbols>", "Comma-separated evaluation universe symbols")
    .option("--asset-class <assetClass>", "Asset class: crypto|equity|bond", "equity")
    .option("--market-region <marketRegion>", "Market region: ton|us|hk|cn|global", "us")
    .option("--venue <venue>", "Venue override (stonfi|nyse|nasdaq|hkex|sse|szse|cibm)")
    .option(
      "--provider <provider>",
      "Provider override (okx|binance|hyperliquid|synthetic|yfinance|openbb)",
    )
    .option("--start-date <date>", "Start date (YYYY-MM-DD)")
    .option("--end-date <date>", "End date (YYYY-MM-DD)")
    .option("--train-ratio <n>", "Training split ratio", "0.6")
    .option("--validation-ratio <n>", "Validation split ratio", "0.2")
    .option("--point-in-time", "Mark the evaluation as point-in-time safe")
    .option("--survivorship-bias-controlled", "Mark the evaluation as survivorship-safe")
    .option(
      "--n-trials <n>",
      "Number of materially different factor variants tested before publication",
      parsePositiveInteger,
    )
    .option("--code-version <id>", "Code version or git SHA", "local")
    .option("--output <path>", "Write factor-evaluation.json to a stable file path")
    .action(async (opts: FactorEvaluateOptions) => {
      const json = program.opts().json ?? false;
      await handleCommand(
        { json },
        async () => {
          const { readFileSync, writeFileSync } = await import("node:fs");
          const definition = JSON.parse(readFileSync(opts.definitionFile, "utf-8"));
          const liquidityAssumptions = JSON.parse(
            readFileSync(opts.liquidityAssumptionsFile, "utf-8"),
          );
          const costModel = JSON.parse(readFileSync(opts.costModelFile, "utf-8"));
          const result = await runFactorEvaluate({
            definition,
            symbols: opts.symbols.split(",").map((symbol) => symbol.trim()),
            assetClass: opts.assetClass,
            marketRegion: opts.marketRegion,
            venue: opts.venue,
            provider: opts.provider,
            startDate: opts.startDate,
            endDate: opts.endDate,
            trainRatio: Number(opts.trainRatio),
            validationRatio: Number(opts.validationRatio),
            pointInTime: Boolean(opts.pointInTime),
            survivorshipBiasControlled: Boolean(opts.survivorshipBiasControlled),
            nTrials: opts.nTrials,
            codeVersion: opts.codeVersion,
            liquidityAssumptions,
            costModel,
          });
          if (opts.output) {
            writeFileSync(opts.output, `${JSON.stringify(result.evaluation, null, 2)}\n`, "utf-8");
            return attachReceipt(
              { ...result, output: opts.output },
              {
                action: "factor.evaluate",
                target: definition.id ?? definition.signalFormula ?? "factor-evaluation",
                writes: [{ kind: "file", path: opts.output }],
              },
            );
          }
          return result;
        },
        (result) => {
          const output = (result as Record<string, unknown>).output;
          return `${formatFactorEvaluate(result)}${typeof output === "string" ? `Saved factor-evaluation.json to ${output}\n` : ""}`;
        },
      );
    });

  // Marketplace commands (publish, discover, subscribe, top, etc.)
  registerFactorMarketplaceCommands(command);
  registerFactorAuthorCommands(command);
  registerFactorPlatformCommands(command);
  registerFactorPullCommands(command);

  // Composition commands (compose, composites, composite, composite-delete)
  registerFactorComposeCommands(command);

  // Backtest, alert, and report commands
  registerFactorBacktestCommands(command);
  registerFactorAlertCommands(command);
  registerFactorReportCommands(command);

  // Seed and skill export
  registerFactorSeedCommands(command);
  registerFactorSkillCommands(command);
}

import {
  discoverFactors,
  FactorEvaluationArtifactSchema,
  type FactorMetaPublic,
  getFactorDecayView,
  getFactorIcView,
  getFactorLeaderboard,
  getFactorUniquenessView,
  publishFactor,
  subscribeFactor,
  unsubscribeFactor,
  validateFactorMarketplaceContract,
  validateFactorMetricsCompleteness,
} from "@tonquant/core";
import type { Command } from "commander";
import {
  formatFactorDecay,
  formatFactorDiscover,
  formatFactorIc,
  formatFactorPublish,
  formatFactorSubscribe,
  formatFactorTop,
  formatFactorUniqueness,
  formatFactorUnsubscribe,
} from "../utils/format-marketplace.js";
import { CliCommandError, handleCommand } from "../utils/output.js";

// ── Command registration ───────────────────────────────────

/**
 * Add marketplace subcommands to an existing factor Command.
 * Called from factor.ts after the quant subcommands (list, compute) are registered.
 */
export function registerFactorMarketplaceCommands(factor: Command): void {
  factor
    .command("ic <factorId>")
    .description("Show local factor IC / ICIR / t-stat summary from the registry")
    .action(async (factorId: string) => {
      const json = factor.parent?.opts().json ?? false;
      await handleCommand({ json }, async () => getFactorIcView(factorId), formatFactorIc);
    });

  factor
    .command("decay <factorId>")
    .description("Show local factor IC decay and disclosed half-life from the registry")
    .action(async (factorId: string) => {
      const json = factor.parent?.opts().json ?? false;
      await handleCommand({ json }, async () => getFactorDecayView(factorId), formatFactorDecay);
    });

  factor
    .command("uniqueness <factorId>")
    .description("Show local factor crowding, turnover, and capacity profile from the registry")
    .action(async (factorId: string) => {
      const json = factor.parent?.opts().json ?? false;
      await handleCommand(
        { json },
        async () => getFactorUniquenessView(factorId),
        formatFactorUniqueness,
      );
    });

  // ── publish ──
  factor
    .command("publish")
    .description("Publish a factor to the local registry")
    .requiredOption("--name <name>", "Factor display name")
    .requiredOption(
      "--category <category>",
      "Category: momentum|value|volatility|liquidity|sentiment|custom",
    )
    .requiredOption("--evaluation-file <path>", "Path to factor-evaluation.json")
    .option("--source <source>", "Source type: indicator|liquidity|derived", "indicator")
    .option("--description <desc>", "Factor description", "")
    .option("--force", "Overwrite existing factor with same ID")
    .action(async (opts) => {
      const json = factor.parent?.opts().json ?? false;
      await handleCommand(
        { json },
        async () => {
          const id = opts.name
            .toLowerCase()
            .replace(/[^a-z0-9]/gu, "_")
            .slice(0, 64);
          const now = new Date().toISOString();
          const { readFileSync } = await import("node:fs");
          const evaluation = FactorEvaluationArtifactSchema.parse(
            JSON.parse(readFileSync(opts.evaluationFile, "utf-8")),
          );
          const missingFields = validateFactorMetricsCompleteness(evaluation.metrics.factorQuality);
          if (missingFields.length > 0) {
            throw new CliCommandError(
              `Evaluation artifact is missing required factor-quality fields: ${missingFields.join(", ")}. Re-run tonquant factor evaluate --n-trials <N>.`,
              "METRIC_INCOMPLETE",
            );
          }
          const validation = validateFactorMarketplaceContract({
            factorQuality: evaluation.metrics.factorQuality,
            implementationProfile: evaluation.metrics.implementationProfile,
            provenance: evaluation.provenance,
          });
          if (validation.hardFailures.length > 0) {
            throw new CliCommandError(
              validation.hardFailures.map((issue) => issue.message).join(" "),
              "MARKETPLACE_HARD_GATE_FAILED",
            );
          }

          const meta: FactorMetaPublic = {
            id,
            name: opts.name,
            author: "local",
            category: opts.category,
            source: opts.source,
            description: opts.description || `${opts.name} factor`,
            parameters: [],
            listingType: "factor",
            definition: evaluation.definition,
            metrics: evaluation.metrics,
            provenance: evaluation.provenance,
            access: { visibility: "free" },
            version: "1.0.0",
            createdAt: now,
            updatedAt: now,
            referenceBacktest: evaluation.referenceBacktest,
          };

          return publishFactor(meta, { force: opts.force }) as FactorMetaPublic;
        },
        (meta) => {
          const validation = validateFactorMarketplaceContract({
            factorQuality: meta.metrics.factorQuality,
            implementationProfile: meta.metrics.implementationProfile,
            provenance: meta.provenance,
          });
          const rendered = formatFactorPublish(meta);
          if (validation.softWarnings.length === 0) {
            return rendered;
          }
          return `${rendered}\n  Warnings:\n${validation.softWarnings.map((issue) => `    - ${issue.message}`).join("\n")}\n`;
        },
      );
    });

  // ── discover ──
  factor
    .command("discover")
    .description("Discover factors with filters")
    .option("--category <category>", "Filter by category")
    .option("--asset <asset>", "Filter by asset symbol")
    .option("--asset-class <assetClass>", "Filter by asset class")
    .option("--market-region <marketRegion>", "Filter by market region")
    .option("--min-icir <n>", "Minimum OOS ICIR", parseFloat)
    .option("--min-tstat <n>", "Minimum OOS rank t-stat", parseFloat)
    .option("--min-positive-share <n>", "Minimum positive-period share", parseFloat)
    .option("--min-half-life <n>", "Minimum disclosed half-life in days", parseFloat)
    .option("--max-turnover <n>", "Maximum two-way turnover", parseFloat)
    .option("--max-peer-corr <n>", "Maximum absolute peer correlation", parseFloat)
    .option("--timeframe <tf>", "Filter by timeframe")
    .action(async (opts) => {
      const json = factor.parent?.opts().json ?? false;
      const filters = {
        category: opts.category,
        asset: opts.asset,
        assetClass: opts.assetClass,
        marketRegion: opts.marketRegion,
        minRankIcOosIcir: opts.minIcir,
        minRankIcOosTstat: opts.minTstat,
        minPositivePeriodShare: opts.minPositiveShare,
        minHalfLifeDays: opts.minHalfLife,
        maxTurnover: opts.maxTurnover,
        maxPeerCorrelation: opts.maxPeerCorr,
        timeframe: opts.timeframe,
      };
      await handleCommand(
        { json },
        async () => discoverFactors(filters),
        (factors) => formatFactorDiscover(factors, filters),
      );
    });

  // ── subscribe ──
  factor
    .command("subscribe <factorId>")
    .description("Subscribe to a factor for update notifications")
    .action(async (factorId: string) => {
      const json = factor.parent?.opts().json ?? false;
      await handleCommand({ json }, async () => subscribeFactor(factorId), formatFactorSubscribe);
    });

  // ── unsubscribe ──
  factor
    .command("unsubscribe <factorId>")
    .description("Unsubscribe from a factor")
    .action(async (factorId: string) => {
      const json = factor.parent?.opts().json ?? false;
      await handleCommand(
        { json },
        async () => {
          const removed = unsubscribeFactor(factorId);
          return { factorId, removed };
        },
        formatFactorUnsubscribe,
      );
    });

  // Note: `factor list` is handled by the quant boundary (factor.ts).
  // Use `factor discover` for marketplace search.

  // ── top (leaderboard) ──
  factor
    .command("top")
    .description("Show factor leaderboard by factor-native ranking")
    .option("--limit <n>", "Number of factors to show", parseInt, 10)
    .action(async (opts) => {
      const json = factor.parent?.opts().json ?? false;
      await handleCommand(
        { json },
        async () => getFactorLeaderboard({ limit: opts.limit }),
        formatFactorTop,
      );
    });
}

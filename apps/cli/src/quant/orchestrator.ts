/**
 * Orchestrator — chains data→factor→backtest→report.
 * Fail-fast: any step failure stops the chain and writes a partial report.
 */

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runBacktest } from "./api/backtest.js";
import { runDataFetch } from "./api/data-fetch.js";
import { runFactorCompute } from "./api/factor.js";
import { runPresetShow } from "./api/preset.js";
import type { RunQuantApiOptions } from "./api/shared.js";
import { createAutoresearchRunDir, writeArtifactJson } from "./runner/artifact-manager.js";
import type { BacktestCostConfig } from "./types/backtest.js";
import type {
  ArtifactRef,
  AssetClass,
  InstrumentRef,
  MarketRegion,
  ProviderCode,
  VenueCode,
} from "./types/base.js";

export interface OrchestratorInput {
  asset: string;
  symbols?: string[];
  instruments?: InstrumentRef[];
  assetClass?: AssetClass;
  marketRegion?: MarketRegion;
  venue?: VenueCode;
  provider?: ProviderCode;
  period?: string;
  strategy: string;
  presetId?: string;
  iterations: number;
  factors: string[];
  outputDir?: string;
  runId?: string;
  startDate?: string;
  endDate?: string;
  params?: Record<string, string | number | boolean | null>;
  costConfig?: BacktestCostConfig;
}

export interface OrchestratorStepResult {
  step: string;
  status: "completed" | "failed";
  summary: string;
  data?: Record<string, unknown>;
}

export interface OrchestratorOutput {
  runId: string;
  status: "success" | "partial_failure" | "error";
  data: {
    reportPath: string;
    metrics: {
      sharpe: number;
      maxDrawdown: number;
      totalReturn: number;
      winRate: number;
      tradeCount: number;
    };
    recommendation: "buy" | "sell" | "hold";
    factorsSummary: Record<string, number>;
  } | null;
  error: string | null;
  steps: OrchestratorStepResult[];
  artifacts: ArtifactRef[];
}

function parsePeriodDays(period: string): number {
  const match = period.match(/^(\d+)([dDwWmM])$/);
  if (!match) return 90;
  const num = match[1];
  const unit = match[2];
  if (!num || !unit) return 90;
  const n = parseInt(num, 10);
  switch (unit.toLowerCase()) {
    case "d":
      return n;
    case "w":
      return n * 7;
    case "m":
      return n * 30;
    default:
      return 90;
  }
}

function computeDateRange(period: string): { startDate: string; endDate: string } {
  const days = parsePeriodDays(period);
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400_000);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function resolveDateRange(input: OrchestratorInput): { startDate: string; endDate: string } {
  if (input.startDate && input.endDate) {
    return { startDate: input.startDate, endDate: input.endDate };
  }
  return computeDateRange(input.period ?? "90d");
}

function deriveRecommendation(sharpe: number, totalReturn: number): "buy" | "sell" | "hold" {
  if (sharpe > 1.0 && totalReturn > 0) return "buy";
  if (totalReturn < -5) return "sell";
  return "hold";
}

function generateReport(
  input: OrchestratorInput,
  steps: OrchestratorStepResult[],
  metrics: OrchestratorOutput["data"],
  reportDir: string,
): string {
  const reportPath = join(reportDir, "report.md");
  const now = new Date().toISOString();

  const lines: string[] = [
    `# TonQuant Research Report`,
    ``,
    `> Generated: ${now}`,
    `> Asset: ${input.asset}`,
    `> Period: ${input.period ?? `${input.startDate ?? "?"} → ${input.endDate ?? "?"}`}`,
    `> Strategy: ${input.strategy}`,
    ``,
    `## Summary`,
    ``,
  ];

  if (metrics) {
    const rec = metrics.recommendation.toUpperCase();
    lines.push(
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Sharpe Ratio | ${metrics.metrics.sharpe} |`,
      `| Total Return | ${metrics.metrics.totalReturn}% |`,
      `| Max Drawdown | ${(metrics.metrics.maxDrawdown * 100).toFixed(2)}% |`,
      `| Win Rate | ${(metrics.metrics.winRate * 100).toFixed(1)}% |`,
      `| Trade Count | ${metrics.metrics.tradeCount} |`,
      ``,
      `**Recommendation: ${rec}**`,
      ``,
    );

    lines.push(`## Factor Analysis`, ``);
    for (const [name, value] of Object.entries(metrics.factorsSummary)) {
      lines.push(`- **${name}**: ${value}`);
    }
    lines.push(``);
  }

  lines.push(`## Steps`, ``);
  for (const step of steps) {
    const icon = step.status === "completed" ? "+" : "x";
    lines.push(`- [${icon}] ${step.step}: ${step.summary}`);
  }

  const content = lines.join("\n");
  writeFileSync(reportPath, content, "utf-8");
  return reportPath;
}

export async function runOrchestrator(
  input: OrchestratorInput,
  apiOptions?: RunQuantApiOptions,
): Promise<OrchestratorOutput> {
  const steps: OrchestratorStepResult[] = [];
  const artifacts: ArtifactRef[] = [];
  const runId = input.runId ?? randomUUID();
  const { startDate, endDate } = resolveDateRange(input);
  const runDir = createAutoresearchRunDir(runId, input.outputDir);
  const symbols = input.symbols?.length ? input.symbols : [input.asset];

  let strategyParams: Record<string, string | number | boolean | null> = input.params ?? {};

  // Step 0: Load preset (optional)
  if (input.presetId) {
    try {
      const presetResult = await runPresetShow({ presetId: input.presetId }, apiOptions);
      strategyParams = presetResult.preset.params;
      steps.push({
        step: "preset",
        status: "completed",
        summary: `Loaded preset: ${presetResult.preset.name}`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      steps.push({ step: "preset", status: "failed", summary: msg });
      const reportPath = generateReport(input, steps, null, runDir);
      return {
        runId,
        status: "partial_failure",
        data: null,
        error: `Preset load failed: ${msg}`,
        steps,
        artifacts: [{ path: reportPath, label: "Partial report", kind: "file" }],
      };
    }
  }

  // Step 1: Data fetch
  let datasetPath: string | undefined;
  try {
    const dataResult = await runDataFetch(
      {
        symbols,
        instruments: input.instruments,
        assetClass: input.assetClass,
        marketRegion: input.marketRegion,
        venue: input.venue,
        provider: input.provider,
        startDate,
        endDate,
      },
      apiOptions,
    );
    datasetPath = dataResult.artifacts[0]?.path;
    steps.push({
      step: "data_fetch",
      status: "completed",
      summary: `${dataResult.barCount} bars for ${dataResult.fetchedSymbols.join(", ")}`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    steps.push({ step: "data_fetch", status: "failed", summary: msg });
    const reportPath = generateReport(input, steps, null, runDir);
    return {
      runId,
      status: "partial_failure",
      data: null,
      error: `Data fetch failed: ${msg}`,
      steps,
      artifacts: [{ path: reportPath, label: "Partial report", kind: "file" }],
    };
  }

  // Step 2: Factor compute
  const factorsSummary: Record<string, number> = {};
  try {
    const factorResult = await runFactorCompute(
      {
        symbols,
        instruments: input.instruments,
        assetClass: input.assetClass,
        marketRegion: input.marketRegion,
        venue: input.venue,
        provider: input.provider,
        factors: input.factors,
        datasetPath,
      },
      apiOptions,
    );
    // Extract numeric factor values from the result
    for (const col of factorResult.factorColumns) {
      const val = (factorResult as unknown as Record<string, unknown>)[col];
      if (typeof val === "number") {
        factorsSummary[col] = val;
      }
    }
    steps.push({
      step: "factor_compute",
      status: "completed",
      summary: `${factorResult.factorCount} factors computed`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    steps.push({ step: "factor_compute", status: "failed", summary: msg });
    const reportPath = generateReport(input, steps, null, runDir);
    return {
      runId,
      status: "partial_failure",
      data: null,
      error: `Factor compute failed: ${msg}`,
      steps,
      artifacts: [{ path: reportPath, label: "Partial report", kind: "file" }],
    };
  }

  // Step 3: Backtest
  let metrics: OrchestratorOutput["data"] = null;
  try {
    const btResult = await runBacktest(
      {
        strategy: input.strategy,
        params: strategyParams,
        symbols,
        instruments: input.instruments,
        assetClass: input.assetClass,
        marketRegion: input.marketRegion,
        venue: input.venue,
        provider: input.provider,
        startDate,
        endDate,
        datasetPath,
        costConfig: input.costConfig,
      },
      apiOptions,
    );

    const recommendation = deriveRecommendation(btResult.sharpe, btResult.totalReturn);

    metrics = {
      reportPath: "",
      metrics: {
        sharpe: btResult.sharpe,
        maxDrawdown: btResult.maxDrawdown,
        totalReturn: btResult.totalReturn,
        winRate: btResult.winRate,
        tradeCount: btResult.tradeCount,
      },
      recommendation,
      factorsSummary,
    };
    steps.push({
      step: "backtest",
      status: "completed",
      summary: `${btResult.totalReturn}% return, sharpe ${btResult.sharpe}`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    steps.push({ step: "backtest", status: "failed", summary: msg });
    const reportPath = generateReport(input, steps, null, runDir);
    return {
      runId,
      status: "partial_failure",
      data: null,
      error: `Backtest failed: ${msg}`,
      steps,
      artifacts: [{ path: reportPath, label: "Partial report", kind: "file" }],
    };
  }

  // Step 4: Generate report
  const reportPath = generateReport(input, steps, metrics, runDir);
  if (metrics) {
    metrics.reportPath = reportPath;
  }
  steps.push({
    step: "report",
    status: "completed",
    summary: `Report written to ${reportPath}`,
  });

  writeArtifactJson(runDir, "result.json", { input, steps, metrics });

  artifacts.push(
    { path: reportPath, label: "Research report", kind: "file" },
    { path: join(runDir, "result.json"), label: "Run result", kind: "json" },
  );

  return {
    runId,
    status: "success",
    data: metrics,
    error: null,
    steps,
    artifacts,
  };
}

/**
 * Phase 1 quant command formatters — Retro-Futuristic Terminal design system.
 * Helpers imported from format-helpers.ts (shared with format-marketplace.ts).
 */

import chalk from "chalk";
import Table from "cli-table3";
import {
  colorDrawdown,
  colorMACD,
  colorRSI,
  colorSharpe,
  divider,
  header,
  label,
  pctColor,
} from "./format-helpers.js";

// ── Data Commands ────────────────────────────────────────────

export function formatDataFetch(data: Record<string, unknown>): string {
  const symbols = data.fetchedSymbols as string[];
  const datasets =
    (data.datasets as Array<{
      symbol: string;
      instrument: {
        displaySymbol: string;
        assetClass: string;
        marketRegion: string;
        venue: string;
        provider?: string;
      };
      interval: string;
      barCount: number;
    }>) ?? [];
  const instruments =
    (data.instruments as Array<{
      displaySymbol: string;
      assetClass: string;
      marketRegion: string;
      venue: string;
      provider?: string;
    }>) ?? [];
  const range = data.dateRange as { start: string; end: string } | undefined;
  const interval = String(data.interval ?? "1d");

  const table = new Table({
    head: ["Symbol", "Asset", "Market", "Venue", "Provider", "Bars", "Interval"],
    style: { head: ["cyan"] },
  });

  for (const s of symbols) {
    const dataset = datasets.find((entry) => entry.symbol === s);
    const instrument = instruments.find((entry) => entry.displaySymbol === s);
    table.push([
      chalk.cyan(s),
      dataset?.instrument.assetClass ?? instrument?.assetClass ?? "?",
      dataset?.instrument.marketRegion ?? instrument?.marketRegion ?? "?",
      dataset?.instrument.venue ?? instrument?.venue ?? "?",
      dataset?.instrument.provider ?? instrument?.provider ?? "?",
      String(dataset?.barCount ?? 0),
      dataset?.interval ?? interval,
    ]);
  }

  const lines = ["", header("Data Fetch"), divider(), table.toString()];

  if (range) {
    lines.push(`  ${label("Range:")} ${chalk.cyan(range.start)} → ${chalk.cyan(range.end)}`);
  }
  lines.push(`  ${label("Cache:")} ${data.cacheHits} hits, ${data.cacheMisses} misses`);
  lines.push("");

  return lines.join("\n");
}

export function formatDataList(data: Record<string, unknown>): string {
  const datasets = data.datasets as Array<{
    symbol: string;
    barCount: number;
    interval: string;
    instrument?: { assetClass: string; marketRegion: string; venue: string; provider?: string };
  }>;
  if (!datasets?.length)
    return `\n${header("Datasets")}\n${divider()}\n  ${chalk.dim("No cached datasets.")}\n`;

  const table = new Table({
    head: ["Symbol", "Asset", "Market", "Venue", "Provider", "Interval", "Bars"],
    style: { head: ["cyan"] },
  });
  for (const d of datasets) {
    table.push([
      chalk.cyan(d.symbol),
      d.instrument?.assetClass ?? "?",
      d.instrument?.marketRegion ?? "?",
      d.instrument?.venue ?? "?",
      d.instrument?.provider ?? "?",
      d.interval,
      String(d.barCount),
    ]);
  }
  return `\n${header("Datasets")}\n${divider()}\n${table.toString()}\n`;
}

export function formatDataInfo(data: Record<string, unknown>): string {
  const ds = data.dataset as {
    symbol: string;
    instrument?: { assetClass: string; marketRegion: string; venue: string; provider?: string };
    interval: string;
    barCount: number;
    startDate?: string;
    endDate?: string;
  };
  const lines = [
    "",
    header(`Dataset: ${ds.symbol}`),
    divider(),
    `  ${label("Asset:")}     ${chalk.cyan(ds.instrument?.assetClass ?? "?")}`,
    `  ${label("Market:")}    ${chalk.cyan(ds.instrument?.marketRegion ?? "?")}`,
    `  ${label("Venue:")}     ${chalk.cyan(ds.instrument?.venue ?? "?")}`,
    `  ${label("Provider:")}  ${chalk.cyan(ds.instrument?.provider ?? "?")}`,
    `  ${label("Interval:")}  ${chalk.cyan(ds.interval)}`,
    `  ${label("Bars:")}      ${chalk.cyan(String(ds.barCount))}`,
  ];
  if (ds.startDate) {
    lines.push(
      `  ${label("Range:")}     ${chalk.cyan(ds.startDate)} → ${chalk.cyan(ds.endDate ?? "now")}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

// ── Factor Commands ──────────────────────────────────────────

export function formatFactorList(data: Record<string, unknown>): string {
  const factors = data.factors as Array<{
    id: string;
    name: string;
    category: string;
    description: string;
    source: string;
  }>;
  if (!factors?.length) return `\n${header("Factors")}\n  ${chalk.dim("No factors available.")}\n`;

  const table = new Table({
    head: ["ID", "Name", "Category", "Source"],
    style: { head: ["cyan"] },
  });
  for (const f of factors) {
    table.push([chalk.cyan(f.id), f.name, chalk.dim(f.category), chalk.dim(f.source)]);
  }
  return `\n${header("Available Factors")}\n${divider()}\n${table.toString()}\n`;
}

export function formatFactorCompute(data: Record<string, unknown>): string {
  const columns = data.factorColumns as string[];
  const table = new Table({
    head: ["Factor", "Value"],
    style: { head: ["cyan"] },
  });

  for (const col of columns) {
    const val = (data as Record<string, unknown>)[col];
    if (typeof val !== "number") continue;

    let formatted: string;
    if (col === "rsi") formatted = colorRSI(val);
    else if (col.startsWith("macd")) formatted = colorMACD(val);
    else if (col === "volatility") formatted = chalk.yellow(`${val}%`);
    else formatted = chalk.cyan(String(val));

    table.push([chalk.dim(col), formatted]);
  }

  return [
    "",
    header("Factor Analysis"),
    divider(),
    `  ${label("Dataset:")} ${chalk.cyan(String(data.datasetRows))} rows, ${chalk.cyan(String(data.factorCount))} factor(s)`,
    table.toString(),
    "",
  ].join("\n");
}

export function formatFactorEvaluate(data: Record<string, unknown>): string {
  const evaluation = data.evaluation as {
    definition: {
      signalFormula: string;
      universe: { assets: string[]; selectionRule: string; reconstitutionFrequency: string };
    };
    metrics: {
      factorQuality: {
        rankIcOosMean: number;
        rankIcOosIcir: number;
        rankIcOosTstat: number;
        quantileSpreadQ5Q1: number;
        oosIsRatio: number;
        halfLifeDays?: number | null;
        deflatedRankIc?: number;
        stability: {
          positivePeriodShare: number;
          worstSubperiodRankIc: number;
          quantileMonotonicity: number;
          primaryHoldingBucket: string;
        };
      };
      implementationProfile: {
        turnoverTwoWay: number;
        capacityValue: number;
        capacityMethod: string;
        liquidityAssumptions: {
          marketType: string;
          executionLagBars: number;
          slippageBps: number;
          notes?: string;
        };
        peerCorrelation: { maxAbs: number; bucket: string };
      };
    };
    provenance: {
      sampleCount: number;
      averageUniverseSize: number;
      testPeriod: { start: string; end: string };
      costModel: {
        marketType: string;
        feeBps: number;
        executionLagBars: number;
        notes: string;
      };
    };
  };

  const table = new Table({
    head: ["Metric", "Value"],
    style: { head: ["cyan"] },
  });

  table.push(
    [label("Rank IC (OOS)"), chalk.cyan(evaluation.metrics.factorQuality.rankIcOosMean.toFixed(4))],
    [label("ICIR (OOS)"), colorSharpe(evaluation.metrics.factorQuality.rankIcOosIcir)],
    [label("t-stat (OOS)"), chalk.cyan(evaluation.metrics.factorQuality.rankIcOosTstat.toFixed(4))],
    [label("Q5-Q1 Spread"), pctColor(evaluation.metrics.factorQuality.quantileSpreadQ5Q1 * 100)],
    [label("OOS/IS Ratio"), chalk.cyan(evaluation.metrics.factorQuality.oosIsRatio.toFixed(4))],
    [
      label("Half-life"),
      evaluation.metrics.factorQuality.halfLifeDays == null
        ? chalk.dim("n/a")
        : chalk.cyan(`${evaluation.metrics.factorQuality.halfLifeDays.toFixed(1)}d`),
    ],
    [
      label("Deflated Rank IC"),
      evaluation.metrics.factorQuality.deflatedRankIc == null
        ? chalk.dim("n/a")
        : chalk.cyan(evaluation.metrics.factorQuality.deflatedRankIc.toFixed(4)),
    ],
    [
      label("Positive Share"),
      chalk.cyan(
        `${(evaluation.metrics.factorQuality.stability.positivePeriodShare * 100).toFixed(1)}%`,
      ),
    ],
    [
      label("Monotonicity"),
      chalk.cyan(
        `${(evaluation.metrics.factorQuality.stability.quantileMonotonicity * 100).toFixed(1)}%`,
      ),
    ],
    [
      label("Worst Subperiod"),
      chalk.cyan(evaluation.metrics.factorQuality.stability.worstSubperiodRankIc.toFixed(4)),
    ],
    [
      label("Turnover"),
      chalk.cyan(evaluation.metrics.implementationProfile.turnoverTwoWay.toFixed(4)),
    ],
    [
      label("Capacity"),
      `${chalk.cyan(evaluation.metrics.implementationProfile.capacityValue.toFixed(2))} ${chalk.dim(`(${evaluation.metrics.implementationProfile.capacityMethod})`)}`,
    ],
    [
      label("Peer Corr"),
      `${chalk.cyan(evaluation.metrics.implementationProfile.peerCorrelation.maxAbs.toFixed(4))} ${chalk.dim(`(${evaluation.metrics.implementationProfile.peerCorrelation.bucket})`)}`,
    ],
  );

  return [
    "",
    header("Factor Evaluation"),
    divider(),
    `  ${label("Formula:")} ${chalk.cyan(evaluation.definition.signalFormula)}`,
    `  ${label("Assets:")} ${chalk.cyan(evaluation.definition.universe.assets.join(", "))}`,
    `  ${label("Selection:")} ${chalk.dim(evaluation.definition.universe.selectionRule)}`,
    `  ${label("Reconstitution:")} ${chalk.dim(evaluation.definition.universe.reconstitutionFrequency)}`,
    `  ${label("OOS Window:")} ${chalk.cyan(evaluation.provenance.testPeriod.start)} -> ${chalk.cyan(evaluation.provenance.testPeriod.end)}`,
    `  ${label("OOS Samples:")} ${chalk.cyan(String(evaluation.provenance.sampleCount))} dates / avg universe ${chalk.cyan(evaluation.provenance.averageUniverseSize.toFixed(2))}`,
    `  ${label("Holding Bucket:")} ${chalk.dim(evaluation.metrics.factorQuality.stability.primaryHoldingBucket)}`,
    `  ${label("Liquidity:")} ${chalk.dim(`${evaluation.metrics.implementationProfile.liquidityAssumptions.marketType} · lag ${evaluation.metrics.implementationProfile.liquidityAssumptions.executionLagBars} · ${evaluation.metrics.implementationProfile.liquidityAssumptions.slippageBps} bps`)}`,
    `  ${label("Cost:")} ${chalk.dim(`${evaluation.provenance.costModel.marketType} · fee ${evaluation.provenance.costModel.feeBps} bps · lag ${evaluation.provenance.costModel.executionLagBars}`)}`,
    `  ${label("Cost Notes:")} ${chalk.dim(evaluation.provenance.costModel.notes)}`,
    table.toString(),
    "",
  ].join("\n");
}

// ── Backtest Commands ────────────────────────────────────────

export function formatBacktest(data: Record<string, unknown>): string {
  const table = new Table({
    head: ["Metric", "Value"],
    style: { head: ["cyan"] },
  });

  table.push(
    [label("Sharpe Ratio"), colorSharpe(data.sharpe as number)],
    [label("Total Return"), pctColor(data.totalReturn as number)],
    [label("Max Drawdown"), colorDrawdown(data.maxDrawdown as number)],
    [label("Win Rate"), chalk.cyan(`${((data.winRate as number) * 100).toFixed(1)}%`)],
    [label("Trade Count"), chalk.cyan(String(data.tradeCount))],
    [label("Calmar Ratio"), colorSharpe(data.calmar as number)],
    [label("Sortino Ratio"), colorSharpe(data.sortino as number)],
  );

  return ["", header("Backtest Results"), divider(), table.toString(), ""].join("\n");
}

// ── Preset Commands ──────────────────────────────────────────

export function formatPresetList(data: Record<string, unknown>): string {
  const presets = data.presets as Array<{
    id: string;
    name: string;
    strategy: string;
    description: string;
  }>;
  if (!presets?.length) return `\n${header("Presets")}\n  ${chalk.dim("No presets available.")}\n`;

  const table = new Table({
    head: ["ID", "Name", "Strategy"],
    style: { head: ["cyan"] },
  });
  for (const p of presets) {
    table.push([chalk.cyan(p.id), p.name, chalk.dim(p.strategy)]);
  }
  return `\n${header("Strategy Presets")}\n${divider()}\n${table.toString()}\n`;
}

export function formatPresetShow(data: Record<string, unknown>): string {
  const preset = data.preset as Record<string, unknown>;
  const params = preset.params as Record<string, unknown>;

  const lines = [
    "",
    header(`Preset: ${preset.name}`),
    divider(),
    `  ${label("Strategy:")}    ${chalk.cyan(String(preset.strategy))}`,
    `  ${label("Asset:")}       ${chalk.cyan(String(preset.assetClass ?? "?"))}`,
    `  ${label("Market:")}      ${chalk.cyan(String(preset.marketRegion ?? "?"))}`,
    `  ${label("Venue:")}       ${chalk.cyan(String(preset.venue ?? "?"))}`,
    `  ${label("Symbols:")}     ${chalk.cyan((preset.symbols as string[]).join(", "))}`,
  ];
  if (preset.thesis) {
    lines.push(`  ${label("Thesis:")}      ${chalk.blueBright(String(preset.thesis))}`);
  }

  if (params && Object.keys(params).length > 0) {
    const paramTable = new Table({
      head: ["Parameter", "Value"],
      style: { head: ["cyan"] },
    });
    for (const [k, v] of Object.entries(params)) {
      paramTable.push([chalk.dim(k), chalk.cyan(String(v))]);
    }
    lines.push("", paramTable.toString());
  }

  lines.push("");
  return lines.join("\n");
}

// ── Autoresearch Commands ────────────────────────────────────

function formatTrackStatus(status: string): string {
  switch (status) {
    case "completed":
    case "idle":
      return chalk.green.bold(status.toUpperCase());
    case "pending-review":
      return chalk.yellow.bold(status.toUpperCase());
    case "running":
      return chalk.cyan.bold(status.toUpperCase());
    case "blocked":
    case "failed":
      return chalk.red.bold(status.toUpperCase());
    default:
      return chalk.white.bold(status.toUpperCase());
  }
}

function countCandidatesByStatus(candidates: Array<{ status: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const candidate of candidates) {
    counts[candidate.status] = (counts[candidate.status] ?? 0) + 1;
  }
  return counts;
}

export function formatAutoresearchResult(data: Record<string, unknown>): string {
  const baseline = data.baseline as {
    title: string;
    strategy: string;
    assetClass?: string;
    marketRegion?: string;
    venue?: string;
    symbols: string[];
    startDate: string;
    endDate: string;
  };
  const state = data.state as {
    status: string;
    latestRun?: {
      runId: string;
      status: string;
      iterationsCompleted: number;
      iterationsRequested: number;
      completedAt?: string | null;
    } | null;
    bestCandidateId?: string | null;
    latestCandidateId?: string | null;
  };
  const candidates =
    (data.candidates as Array<{
      candidateId: string;
      status: string;
      summary?: string | null;
    }>) ?? [];
  const history =
    (data.history as Array<{
      timestamp: string;
      message: string;
    }>) ?? [];
  const counts = countCandidatesByStatus(candidates);
  const pendingCount = counts["pending-review"] ?? 0;
  const lines = [
    "",
    header("Autoresearch"),
    divider(),
    `  ${label("Track:")} ${chalk.cyan(baseline.title)}`,
    `  ${label("Status:")} ${formatTrackStatus(String(data.status ?? state.status ?? "unknown"))}`,
    `  ${label("Strategy:")} ${chalk.cyan(baseline.strategy)}`,
    `  ${label("Asset:")} ${chalk.cyan(String(baseline.assetClass ?? "?"))}`,
    `  ${label("Market:")} ${chalk.cyan(String(baseline.marketRegion ?? "?"))}`,
    `  ${label("Venue:")} ${chalk.cyan(String(baseline.venue ?? "?"))}`,
    `  ${label("Symbols:")} ${chalk.cyan(baseline.symbols.join(", "))}`,
    `  ${label("Range:")} ${chalk.cyan(baseline.startDate)} → ${chalk.cyan(baseline.endDate)}`,
    `  ${label("Candidates:")} ${chalk.cyan(String(candidates.length))} total, ${chalk.yellow(String(pendingCount))} pending review`,
  ];

  if (state.latestRun) {
    lines.push(
      `  ${label("Latest Run:")} ${chalk.cyan(state.latestRun.runId)} ${chalk.dim(`(${state.latestRun.iterationsCompleted}/${state.latestRun.iterationsRequested})`)}`,
    );
  }
  if (state.bestCandidateId) {
    lines.push(`  ${label("Best Candidate:")} ${chalk.green(state.bestCandidateId)}`);
  }
  if (state.latestCandidateId) {
    lines.push(`  ${label("Latest Candidate:")} ${chalk.cyan(state.latestCandidateId)}`);
  }

  if (candidates.length > 0) {
    const candidateTable = new Table({
      head: ["Candidate", "Status", "Summary"],
      style: { head: ["cyan"] },
    });
    for (const candidate of candidates.slice(-5).reverse()) {
      candidateTable.push([
        chalk.cyan(candidate.candidateId),
        formatTrackStatus(candidate.status),
        chalk.dim(candidate.summary ?? ""),
      ]);
    }
    lines.push("", candidateTable.toString());
  }

  if (history.length > 0) {
    lines.push("", `  ${chalk.bold.cyan("Recent History:")}`);
    for (const entry of history.slice(-3).reverse()) {
      lines.push(`    ${chalk.dim(entry.timestamp)}  ${chalk.white(entry.message)}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

export function formatAutoresearchList(data: Record<string, unknown>): string {
  const tracks =
    (data.tracks as Array<{
      trackId: string;
      title: string;
      status: string;
      updatedAt: string;
      candidateCount: number;
      pendingPromotionCount: number;
    }>) ?? [];

  if (!tracks.length) {
    return `\n${header("Autoresearch Tracks")}\n${divider()}\n  ${chalk.dim("No tracks found.")}\n`;
  }

  const table = new Table({
    head: ["Track", "Status", "Candidates", "Pending", "Updated"],
    style: { head: ["cyan"] },
  });
  for (const track of tracks) {
    table.push([
      chalk.cyan(track.trackId),
      formatTrackStatus(track.status),
      String(track.candidateCount),
      String(track.pendingPromotionCount),
      chalk.dim(track.updatedAt),
    ]);
  }

  return `\n${header("Autoresearch Tracks")}\n${divider()}\n${table.toString()}\n`;
}

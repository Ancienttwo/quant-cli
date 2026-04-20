/**
 * Phase 2 factor marketplace formatters — Retro-Futuristic Terminal design system.
 * Shared helpers imported from format-helpers.ts.
 */

import type {
  AuthorProfile,
  FactorAlert,
  FactorDecayView,
  FactorIcView,
  FactorMetaPublic,
  FactorPerformanceReport,
  FactorSubscription,
  FactorUniquenessView,
} from "@tonquant/core";
import chalk from "chalk";
import Table from "cli-table3";
import { colorSharpe, divider, header, label, pctColor, truncate } from "./format-helpers.js";

// ── Leaderboard ─────────────────────────────────────────────

function rankColor(rank: number, text: string): string {
  if (rank === 1) return chalk.yellow(text);
  if (rank <= 3) return chalk.cyan(text);
  return chalk.dim(text);
}

export function formatFactorTop(factors: FactorMetaPublic[]): string {
  if (factors.length === 0) {
    return [
      "",
      header("Factor Leaderboard"),
      divider(),
      `  ${chalk.dim("Registry is empty — no factors published yet.")}`,
      "",
      `  ${chalk.dim("Get started:")}`,
      `    ${chalk.cyan('tonquant factor publish --name "my_factor" --category momentum \\')}`,
      `    ${chalk.cyan("  --assets TON --timeframe 1d")}`,
      "",
    ].join("\n");
  }

  const table = new Table({
    head: ["#", "Factor", "Rank IC", "ICIR", "Q5-Q1", "Turnover", "Peer", "Cat"],
    style: { head: ["cyan"] },
  });

  for (const [i, f] of factors.entries()) {
    const rank = i + 1;
    const id = truncate(f.id, 20);
    const rankIc = f.metrics.factorQuality.rankIcOosMean.toFixed(4);
    const icir = colorSharpe(f.metrics.factorQuality.rankIcOosIcir);
    const spread = pctColor(f.metrics.factorQuality.quantileSpreadQ5Q1 * 100);
    const turnover = f.metrics.implementationProfile.turnoverTwoWay.toFixed(4);
    const peer = `${f.metrics.implementationProfile.peerCorrelation.maxAbs.toFixed(2)} ${f.metrics.implementationProfile.peerCorrelation.bucket}`;
    const cat = f.category.slice(0, 4);

    table.push([
      rankColor(rank, `#${rank}`),
      rankColor(rank, id),
      chalk.cyan(rankIc),
      icir,
      spread,
      chalk.cyan(turnover),
      chalk.dim(peer),
      chalk.dim(cat),
    ]);
  }

  return [
    "",
    header("Factor Leaderboard"),
    divider(),
    table.toString(),
    `  ${chalk.dim(`${factors.length} factors ranked by ICIR -> Rank IC -> Q5-Q1 -> Turnover -> Peer Corr`)}`,
    "",
  ].join("\n");
}

// ── Author Profile ─────────────────────────────────────────

export function formatAuthorProfile(profile: AuthorProfile): string {
  const aggregateIcir =
    profile.aggregateRankIcOosIcir == null
      ? chalk.dim("n/a")
      : colorSharpe(profile.aggregateRankIcOosIcir);
  const latestPublication = profile.latestPublicationAt
    ? chalk.cyan(profile.latestPublicationAt)
    : chalk.dim("n/a");

  return [
    "",
    header("Publisher Profile"),
    divider(),
    `  ${label("Display:")}              ${profile.displayName}`,
    `  ${label("Wallet:")}               ${chalk.cyan(profile.wallet)}`,
    `  ${label("Lifetime submissions:")} ${chalk.cyan(String(profile.lifetimeSubmissions))}`,
    `  ${label("Active factors:")}       ${chalk.cyan(String(profile.activeFactors))}`,
    `  ${label("Aggregate ICIR:")}       ${aggregateIcir}`,
    `  ${label("Subscribers:")}          ${chalk.cyan(String(profile.subscriberCount))}`,
    `  ${label("Resolved challenges:")}  ${chalk.cyan(String(profile.resolvedChallenges))}`,
    `  ${label("Open challenges:")}      ${chalk.cyan(String(profile.openChallenges))}`,
    `  ${label("Latest publication:")}   ${latestPublication}`,
    "",
  ].join("\n");
}

// ── Discover ────────────────────────────────────────────────

export interface DiscoverDisplayFilters {
  category?: string;
  asset?: string;
  assetClass?: string;
  marketRegion?: string;
  minRankIcOosIcir?: number;
  minRankIcOosTstat?: number;
  minPositivePeriodShare?: number;
  minHalfLifeDays?: number;
  maxTurnover?: number;
  maxPeerCorrelation?: number;
  timeframe?: string;
}

export function formatFactorDiscover(
  factors: FactorMetaPublic[],
  filters?: DiscoverDisplayFilters,
): string {
  if (factors.length === 0) {
    const lines = [
      "",
      header("Factor Search"),
      divider(),
      `  ${chalk.dim("No factors match your filters.")}`,
    ];

    if (filters) {
      const applied = Object.entries(filters)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `    ${chalk.dim(`${k}:`)} ${chalk.dim(String(v))}`);
      if (applied.length > 0) {
        lines.push("", `  ${chalk.dim("Applied filters:")}`, ...applied);
      }
    }

    lines.push(
      "",
      `  ${chalk.dim("Try:")}`,
      `    ${chalk.cyan("• Run `factor top` to see all factors")}`,
      "",
    );
    return lines.join("\n");
  }

  const table = new Table({
    head: ["ID", "Cat", "ICIR", "Rank IC", "Assets", "TF", "Vis"],
    style: { head: ["cyan"] },
  });

  for (const f of factors) {
    table.push([
      chalk.cyan(truncate(f.id, 20)),
      chalk.dim(f.category.slice(0, 4)),
      colorSharpe(f.metrics.factorQuality.rankIcOosIcir),
      chalk.cyan(f.metrics.factorQuality.rankIcOosMean.toFixed(4)),
      f.definition.universe.assets.join(","),
      f.definition.timeframe,
      chalk.dim(f.access.visibility),
    ]);
  }

  const filterSuffix = filters
    ? Object.entries(filters)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")
    : "";

  return [
    "",
    header("Factor Search"),
    divider(),
    table.toString(),
    `  ${chalk.dim(`${factors.length} factors found${filterSuffix ? ` (filtered: ${filterSuffix})` : ""}`)}`,
    "",
  ].join("\n");
}

// ── Publish ─────────────────────────────────────────────────

export function formatFactorPublish(meta: FactorMetaPublic): string {
  const icir = colorSharpe(meta.metrics.factorQuality.rankIcOosIcir);
  const rankIc = meta.metrics.factorQuality.rankIcOosMean.toFixed(4);
  const spread = pctColor(meta.metrics.factorQuality.quantileSpreadQ5Q1 * 100);
  const turnover = meta.metrics.implementationProfile.turnoverTwoWay.toFixed(4);

  return [
    "",
    chalk.bold.green("  Factor Published"),
    divider(),
    `  ${label("ID:")}         ${chalk.cyan(meta.id)}`,
    `  ${label("Name:")}       ${meta.name}`,
    `  ${label("Category:")}   ${meta.category}`,
    `  ${label("Assets:")}     ${meta.definition.universe.assets.join(", ")}`,
    `  ${label("Timeframe:")}  ${meta.definition.timeframe}`,
    `  ${label("Version:")}    ${meta.version}`,
    "",
    `  ${label("Quality:")}    Rank IC ${chalk.cyan(rankIc)} · ICIR ${icir} · Q5-Q1 ${spread}`,
    `  ${label("Impl:")}       Turnover ${chalk.cyan(turnover)} · Peer ${chalk.cyan(meta.metrics.implementationProfile.peerCorrelation.maxAbs.toFixed(4))} (${meta.metrics.implementationProfile.peerCorrelation.bucket})`,
    "",
  ].join("\n");
}

// ── Read Models ────────────────────────────────────────────

export function formatFactorIc(view: FactorIcView): string {
  const secondaryIc =
    view.icOosMean == null || view.icOosIcir == null || view.icOosTstat == null
      ? chalk.dim("n/a")
      : `${chalk.cyan(view.icOosMean.toFixed(4))} · ${colorSharpe(view.icOosIcir)} · ${chalk.cyan(view.icOosTstat.toFixed(2))}`;
  const deflated =
    view.deflatedRankIc == null
      ? chalk.dim("n/a")
      : `${chalk.cyan(view.deflatedRankIc.toFixed(4))}${view.nTrials ? chalk.dim(` (${view.nTrials} trials)`) : ""}`;
  const halfLife =
    view.halfLifeDays == null ? chalk.dim("n/a") : chalk.cyan(`${view.halfLifeDays.toFixed(1)}d`);
  const stability = view.stability;

  return [
    "",
    header("Factor IC"),
    divider(),
    `  ${label("Factor:")}      ${chalk.cyan(view.factorId)} ${chalk.dim(`(${view.factorVersion})`)}`,
    `  ${label("Name:")}        ${view.factorName}`,
    `  ${label("Rank IC:")}     ${chalk.cyan(view.rankIcOosMean.toFixed(4))}`,
    `  ${label("Rank ICIR:")}   ${colorSharpe(view.rankIcOosIcir)}`,
    `  ${label("Rank t-stat:")} ${chalk.cyan(view.rankIcOosTstat.toFixed(2))}`,
    `  ${label("IC:")}          ${secondaryIc}`,
    `  ${label("Deflated:")}    ${deflated}`,
    `  ${label("Half-life:")}   ${halfLife}`,
    `  ${label("Stability:")}   ${chalk.cyan((stability.positivePeriodShare * 100).toFixed(1))}% ${chalk.dim("positive periods")} · ${chalk.cyan((stability.quantileMonotonicity * 100).toFixed(1))}% ${chalk.dim("monotonic")}`,
    `  ${label("Worst bucket:")} ${chalk.cyan(stability.worstSubperiodRankIc.toFixed(4))} ${chalk.dim(`across ${stability.subperiodCount} subperiods`)}`,
    `  ${label("Sample:")}      ${chalk.cyan(String(view.sampleCount))} ${chalk.dim(`${view.evaluationFrequency} obs`)}`,
    `  ${label("Universe:")}    ${chalk.cyan(view.averageUniverseSize.toFixed(0))} ${chalk.dim("avg names")}`,
    "",
  ].join("\n");
}

export function formatFactorDecay(view: FactorDecayView): string {
  const table = new Table({
    head: ["Horizon", "Rank IC", "IC"],
    style: { head: ["cyan"] },
  });

  for (const point of view.decay) {
    table.push([
      chalk.cyan(point.horizon),
      chalk.cyan(point.rankIc.toFixed(4)),
      point.ic == null ? chalk.dim("n/a") : chalk.cyan(point.ic.toFixed(4)),
    ]);
  }

  const halfLife =
    view.halfLifeDays == null ? chalk.dim("n/a") : chalk.cyan(`${view.halfLifeDays.toFixed(1)}d`);

  return [
    "",
    header("Factor Decay"),
    divider(),
    `  ${label("Factor:")}      ${chalk.cyan(view.factorId)} ${chalk.dim(`(${view.factorVersion})`)}`,
    `  ${label("Name:")}        ${view.factorName}`,
    `  ${label("Half-life:")}   ${halfLife}`,
    `  ${label("Horizon:")}     ${chalk.cyan(view.primaryHoldingBucket)}`,
    `  ${label("Sample:")}      ${chalk.cyan(String(view.sampleCount))} ${chalk.dim(`${view.evaluationFrequency} obs`)}`,
    "",
    table.toString(),
    "",
  ].join("\n");
}

export function formatFactorUniqueness(view: FactorUniquenessView): string {
  const peer = view.peerCorrelation;
  const liquidityNotes = (() => {
    const base = [
      peer.universeSize != null ? `peer set ${peer.universeSize}` : null,
      `lag ${view.liquidityAssumptions.executionLagBars} bars`,
      `${view.liquidityAssumptions.slippageBps} bps`,
    ];
    if (view.liquidityAssumptions.marketType === "ton-defi") {
      base.push(
        `${view.liquidityAssumptions.poolType} pool`,
        `depth ${view.liquidityAssumptions.poolDepthUsd.toFixed(0)} usd`,
        `max ${(view.liquidityAssumptions.maxPoolParticipationPct * 100).toFixed(1)}%`,
      );
    } else {
      base.push(`adv ${(view.liquidityAssumptions.advParticipationPct * 100).toFixed(1)}%`);
    }
    if (
      "makerTakerBps" in view.liquidityAssumptions &&
      view.liquidityAssumptions.makerTakerBps != null
    ) {
      base.push(`${view.liquidityAssumptions.makerTakerBps} bps maker/taker`);
    }
    return base.filter(Boolean).join(" · ");
  })();

  return [
    "",
    header("Factor Uniqueness"),
    divider(),
    `  ${label("Factor:")}      ${chalk.cyan(view.factorId)} ${chalk.dim(`(${view.factorVersion})`)}`,
    `  ${label("Name:")}        ${view.factorName}`,
    `  ${label("Peer maxAbs:")} ${chalk.cyan(peer.maxAbs.toFixed(4))} ${chalk.dim(peer.bucket)}`,
    `  ${label("Peer avgAbs:")} ${peer.avgAbs == null ? chalk.dim("n/a") : chalk.cyan(peer.avgAbs.toFixed(4))}`,
    `  ${label("Turnover:")}    ${chalk.cyan(view.turnoverTwoWay.toFixed(4))}`,
    `  ${label("Capacity:")}    ${chalk.cyan(view.capacityValue.toFixed(2))} ${chalk.dim(`(${view.capacityMethod})`)}`,
    `  ${label("Market:")}      ${chalk.dim(view.liquidityAssumptions.marketType)}`,
    `  ${label("Liquidity:")}   ${liquidityNotes ? chalk.dim(liquidityNotes) : chalk.dim("n/a")}`,
    view.liquidityAssumptions.notes
      ? `  ${label("Notes:")}       ${chalk.dim(view.liquidityAssumptions.notes)}`
      : "",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ── Compose ─────────────────────────────────────────────────

export interface CompositionResult {
  id: string;
  components: Array<{ factorId: string; weight: number; sharpe: number }>;
  estimatedSharpe: number;
  saved: boolean;
}

export function formatFactorCompose(result: CompositionResult): string {
  const lines = ["", header("Factor Composition"), divider(), `  ${chalk.dim("Components:")}`];

  for (const c of result.components) {
    const w = c.weight.toFixed(2);
    const s = colorSharpe(c.sharpe);
    lines.push(`    ${chalk.cyan(w)} × ${chalk.cyan(truncate(c.factorId, 20))}  (Sharpe: ${s})`);
  }

  lines.push(
    "",
    `  ${label("Composed Factor:")}`,
    `  ${label("ID:")}          ${chalk.cyan(result.id)}`,
    `  ${label("Est. Sharpe:")} ~${colorSharpe(result.estimatedSharpe)} (weighted)`,
    `  ${label("Status:")}      ${result.saved ? chalk.green("Saved to registry") : chalk.yellow("Not saved")}`,
    "",
  );

  return lines.join("\n");
}

// ── Subscribe / Unsubscribe ─────────────────────────────────

export function formatFactorSubscribe(sub: FactorSubscription): string {
  return `${chalk.green("Subscribed")} to local registry updates for ${chalk.cyan(sub.factorId)} at ${chalk.dim(sub.subscribedAt)}`;
}

export interface UnsubscribeResult {
  factorId: string;
  removed: boolean;
}

export function formatFactorUnsubscribe(result: UnsubscribeResult): string {
  if (result.removed) {
    return `${chalk.yellow("Unsubscribed")} from ${chalk.cyan(result.factorId)}`;
  }
  return `${chalk.dim("Not subscribed")} to ${result.factorId}`;
}

// ── Alerts ──────────────────────────────────────────────────

export function formatFactorAlertList(alerts: FactorAlert[]): string {
  if (alerts.length === 0) {
    return [
      "",
      header("Factor Alerts"),
      divider(),
      `  ${chalk.dim("No active alerts.")}`,
      "",
      `  ${chalk.dim("Set one:")}`,
      `    ${chalk.cyan("tonquant factor alert-set --help")}`,
      "",
    ].join("\n");
  }

  const table = new Table({
    head: ["Factor", "Metric", "Condition", "Threshold", "Active"],
    style: { head: ["cyan"] },
  });

  for (const a of alerts) {
    table.push([
      chalk.cyan(truncate(a.factorId, 20)),
      chalk.dim(a.metric),
      a.condition,
      String(a.threshold),
      a.active ? chalk.green("✓") : chalk.dim("✗"),
    ]);
  }

  const activeCount = alerts.filter((a) => a.active).length;
  return [
    "",
    header("Factor Alerts"),
    divider(),
    table.toString(),
    `  ${chalk.dim(`${activeCount} active alert${activeCount !== 1 ? "s" : ""}`)}`,
    "",
  ].join("\n");
}

export function formatFactorAlertSet(alert: FactorAlert): string {
  return [
    `${chalk.green("Alert set:")} ${chalk.cyan(alert.factorId)}`,
    `  ${label("Metric:")} ${chalk.cyan(alert.metric)}`,
    `  ${label("Condition:")} ${alert.condition} ${chalk.cyan(String(alert.threshold))}`,
  ].join("\n");
}

// ── Social Proof Report ─────────────────────────────────────

export function formatFactorReport(report: FactorPerformanceReport): string {
  return [
    "",
    chalk.bold.green("  Performance Report Submitted"),
    divider(),
    `  ${label("Factor:")}     ${chalk.cyan(report.factorId)}`,
    `  ${label("Return:")}     ${pctColor(report.returnPct)} (${report.period})`,
    `  ${label("Agent:")}      ${chalk.cyan(report.agentId)}`,
    `  ${label("Status:")}     ${chalk.yellow("unverified")}`,
    "",
  ].join("\n");
}

export function formatFactorReportList(reports: FactorPerformanceReport[]): string {
  if (reports.length === 0) {
    return [
      "",
      header("Performance Reports"),
      divider(),
      `  ${chalk.dim("No reports submitted yet.")}`,
      "",
    ].join("\n");
  }

  const table = new Table({
    head: ["Factor", "Return", "Period", "Agent", "Status"],
    style: { head: ["cyan"] },
  });

  for (const r of reports) {
    table.push([
      chalk.cyan(r.factorId),
      pctColor(r.returnPct),
      r.period,
      truncate(r.agentId, 20),
      r.verified ? chalk.green("verified") : chalk.yellow("unverified"),
    ]);
  }

  return [
    "",
    header(`Performance Reports (${reports.length})`),
    divider(),
    table.toString(),
    "",
  ].join("\n");
}

/**
 * Shared CLI formatting helpers — Retro-Futuristic Terminal design system.
 *
 * Color mapping (DESIGN.md):
 *   Primary   → chalk.cyan    (key data, highlights)
 *   Secondary → chalk.yellow  (warnings, secondary accent)
 *   Success   → chalk.green   (positive, profit)
 *   Error     → chalk.red     (negative, loss)
 *   Info      → chalk.blueBright (informational)
 *   Neutral   → chalk.dim     (labels, secondary text)
 *   Bold      → chalk.bold    (headers)
 */

import chalk from "chalk";

// ── Layout helpers ──────────────────────────────────────────

export function header(title: string): string {
  return chalk.bold.cyan(`  ${title}`);
}

export function divider(): string {
  return chalk.dim(`  ${"─".repeat(48)}`);
}

export function label(text: string): string {
  return chalk.dim(text);
}

// ── Numeric color helpers ───────────────────────────────────

export function signColor(value: number): string {
  const str = value > 0 ? `+${value}` : `${value}`;
  if (value > 0) return chalk.green(str);
  if (value < 0) return chalk.red(str);
  return chalk.dim(str);
}

export function pctColor(value: number): string {
  const str = `${value}%`;
  if (value > 0) return chalk.green(str);
  if (value < 0) return chalk.red(str);
  return chalk.dim(str);
}

// ── Metric-specific color helpers ───────────────────────────

export function colorSharpe(val: number): string {
  if (val > 1) return chalk.green(val.toFixed(4));
  if (val < 0) return chalk.red(val.toFixed(4));
  return chalk.yellow(val.toFixed(4));
}

export function colorDrawdown(val: number): string {
  const pct = (val * 100).toFixed(2);
  if (val > 0.1) return chalk.red(`${pct}%`);
  if (val > 0.05) return chalk.yellow(`${pct}%`);
  return chalk.green(`${pct}%`);
}

export function colorRSI(value: number): string {
  if (value > 70) return chalk.red(`${value} (overbought)`);
  if (value < 30) return chalk.green(`${value} (oversold)`);
  return chalk.cyan(String(value));
}

export function colorMACD(value: number): string {
  if (value > 0) return chalk.green(value.toFixed(6));
  if (value < 0) return chalk.red(value.toFixed(6));
  return chalk.dim(value.toFixed(6));
}

export function recColor(rec: string): string {
  switch (rec.toLowerCase()) {
    case "buy":
      return chalk.green.bold("BUY");
    case "sell":
      return chalk.red.bold("SELL");
    default:
      return chalk.yellow.bold("HOLD");
  }
}

// ── Display helpers ─────────────────────────────────────────

/** Truncate a string to maxLen, appending "…" if truncated. */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen - 1)}…`;
}

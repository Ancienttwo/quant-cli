import chalk from "chalk";
import Table from "cli-table3";
import type {
  BalanceData,
  HistoryData,
  MarketCandlesData,
  MarketCompareData,
  MarketQuoteData,
  MarketSearchData,
  PoolData,
  PriceData,
  ResearchData,
  SwapSimulationData,
  TrendingData,
} from "../types/cli.js";
import { divider, header } from "./format-helpers.js";

/**
 * Format a raw price string to a human-readable number.
 * Prices >= $1 show 2 decimals, < $1 show up to 6 significant digits.
 */
export function formatUsd(raw: string): string {
  const n = parseFloat(raw);
  if (Number.isNaN(n)) return raw;
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toPrecision(4);
}

/**
 * Color a percentage change string green (positive) or red (negative).
 */
export function greenRed(value: string): string {
  if (value.startsWith("+")) {
    return chalk.green(value);
  }
  if (value.startsWith("-")) {
    return chalk.red(value);
  }
  return chalk.gray(value);
}

/**
 * Format price data for human-readable output.
 */
export function formatPrice(data: PriceData): string {
  const lines = [
    header(`${data.symbol} (${data.name})`),
    divider(),
    `  Price:     ${chalk.cyan(`$${formatUsd(data.price_usd)}`)}`,
    `  24h:       ${greenRed(data.change_24h)}`,
    `  Volume:    $${data.volume_24h}`,
    data.market_cap ? `  Mkt Cap:   $${data.market_cap}` : null,
    chalk.dim(`  Address:   ${data.address}`),
  ];
  return lines.filter(Boolean).join("\n");
}

function formatSignedNumber(raw: string): string {
  const n = Number.parseFloat(raw);
  if (Number.isNaN(n)) return raw;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(3)}`;
}

export function formatMarketQuote(data: MarketQuoteData): string {
  const lines = [
    header(`${data.symbol} (${data.name})`),
    divider(),
    `  Price:     ${chalk.cyan(`${data.price} ${data.trust.quote_currency}`)}`,
    `  24h:       ${greenRed(data.change_24h_pct)}`,
    `  Volume:    ${data.volume_24h} ${data.trust.quote_currency}`,
    data.high_24h ? `  High:      ${data.high_24h} ${data.trust.quote_currency}` : null,
    data.low_24h ? `  Low:       ${data.low_24h} ${data.trust.quote_currency}` : null,
    divider(),
    chalk.dim(`  Provider:  ${data.trust.provider}`),
    chalk.dim(`  Venue:     ${data.trust.venue}`),
    chalk.dim(`  Symbol:    ${data.trust.provider_symbol}`),
    chalk.dim(`  Observed:  ${data.trust.observed_at}`),
    chalk.dim(`  Age:       ${data.trust.age_seconds}s`),
  ];
  return lines.filter(Boolean).join("\n");
}

export function formatMarketSearch(data: MarketSearchData): string {
  const table = new Table({
    head: ["Symbol", "Name", "Provider", "Type", "Provider Symbol"],
    style: { head: ["cyan"] },
  });
  for (const candidate of data.candidates) {
    table.push([
      chalk.bold(candidate.symbol),
      candidate.name,
      candidate.provider,
      candidate.market_type,
      candidate.provider_symbol,
    ]);
  }
  return `${header(`Research Search: ${data.query}`)}\n${divider()}\n${table.toString()}`;
}

export function formatMarketCompare(data: MarketCompareData): string {
  const table = new Table({
    head: ["Provider", "Price", "24h", "Volume", "Provider Symbol"],
    style: { head: ["cyan"] },
  });
  for (const quote of data.quotes) {
    table.push([
      quote.trust.provider,
      `${quote.price} ${quote.trust.quote_currency}`,
      greenRed(quote.change_24h_pct),
      `${quote.volume_24h} ${quote.trust.quote_currency}`,
      quote.trust.provider_symbol,
    ]);
  }
  return [
    header(`Research Compare: ${data.symbol}`),
    divider(),
    table.toString(),
    divider(),
    `  Spread:    ${formatSignedNumber(data.spread_abs)} (${data.spread_pct})`,
  ].join("\n");
}

export function formatMarketCandles(data: MarketCandlesData): string {
  const table = new Table({
    head: ["Open Time", "Open", "High", "Low", "Close", "Volume"],
    style: { head: ["cyan"] },
  });
  for (const candle of data.candles.slice(-10)) {
    table.push([
      candle.open_time,
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      candle.volume,
    ]);
  }
  return [
    header(`Research Candles: ${data.symbol} (${data.interval})`),
    divider(),
    chalk.dim(
      `  ${data.trust.provider} ${data.trust.provider_symbol} • observed ${data.trust.observed_at} • age ${data.trust.age_seconds}s`,
    ),
    divider(),
    table.toString(),
  ].join("\n");
}

/**
 * Format pool data for human-readable output.
 */
export function formatPool(data: PoolData): string {
  const table = new Table({
    head: ["Field", "Value"],
    style: { head: ["cyan"] },
  });
  table.push(
    ["Pool", data.pool_address],
    ["Token 0", `${data.token0.symbol} (reserve: ${data.token0.reserve})`],
    ["Token 1", `${data.token1.symbol} (reserve: ${data.token1.reserve})`],
    ["Liquidity", `$${data.liquidity_usd}`],
    ["Volume 24h", `$${data.volume_24h}`],
    ["Fee Rate", data.fee_rate],
    ["APY", data.apy ?? "N/A"],
  );
  return table.toString();
}

/**
 * Format trending tokens for human-readable output.
 */
export function formatTrending(data: TrendingData): string {
  const table = new Table({
    head: ["#", "Symbol", "Price (USD)", "24h Change", "Volume 24h"],
    style: { head: ["cyan"] },
  });
  for (const token of data.tokens) {
    table.push([
      token.rank,
      chalk.bold(token.symbol),
      `$${formatUsd(token.price_usd)}`,
      greenRed(token.change_24h),
      `$${token.volume_24h}`,
    ]);
  }
  return table.toString();
}

/**
 * Format balance data for human-readable output.
 */
export function formatBalance(data: BalanceData): string {
  const lines = [
    header(`Wallet: ${data.address}`),
    chalk.dim(`  Network: ${data.network}`),
    divider(),
    `  TON:  ${chalk.cyan(data.toncoin.balance)} ($${formatUsd(data.toncoin.usd_value)})`,
  ];
  for (const jetton of data.jettons) {
    lines.push(
      `  ${jetton.symbol}: ${chalk.cyan(jetton.balance)} ($${formatUsd(jetton.usd_value)})`,
    );
  }
  lines.push(divider(), chalk.bold(`  Total: $${formatUsd(data.total_usd)}`));
  return lines.join("\n");
}

export function formatInitResult(data: { address: string; network: string }): string {
  return [
    header("Wallet Configured"),
    divider(),
    `  Address: ${chalk.cyan(data.address)}`,
    `  Network: ${chalk.cyan(data.network)}`,
  ].join("\n");
}

/**
 * Format swap simulation for human-readable output.
 */
export function formatSwapSimulation(data: SwapSimulationData): string {
  const table = new Table({
    style: { head: ["cyan"] },
  });
  table.push(
    { From: `${data.from.amount} ${data.from.symbol} ($${data.from.amount_usd})` },
    { To: `${data.to.expected_amount} ${data.to.symbol} ($${data.to.amount_usd})` },
    { "Price Impact": data.price_impact },
    { Fee: data.fee },
    { "Min Received": data.minimum_received },
    { Slippage: data.slippage_tolerance },
    { Route: data.route.join(" → ") },
  );
  return `${header("Swap Simulation")}\n${divider()}\n${table.toString()}`;
}

/**
 * Format transaction history for human-readable output.
 */
export function formatHistory(data: HistoryData): string {
  const lines = [
    header(`Transaction History: ${data.address}`),
    chalk.dim(`  Showing ${data.transactions.length} of ${data.total} transactions`),
    divider(),
  ];
  const table = new Table({
    head: ["Time", "Type", "Description", "Status"],
    style: { head: ["cyan"] },
  });
  for (const tx of data.transactions) {
    table.push([
      tx.timestamp,
      tx.type,
      tx.description,
      tx.status === "ok" ? chalk.green("ok") : chalk.red(tx.status),
    ]);
  }
  lines.push(table.toString());
  return lines.join("\n");
}

/**
 * Format research report for human-readable output.
 */
export function formatResearch(data: ResearchData): string {
  const lines = [
    header(`Research Liquidity: ${data.token.symbol} (${data.token.name})`),
    divider(),
    formatPrice(data.token),
    "",
    header("Pools"),
    divider(),
  ];
  for (const pool of data.pools) {
    lines.push(
      `  ${pool.token0.symbol}/${pool.token1.symbol} — Liquidity: $${pool.liquidity_usd} — Fee: ${pool.fee_rate}`,
    );
  }
  lines.push(
    "",
    header("Summary"),
    divider(),
    `  Total Liquidity: $${data.summary.total_liquidity_usd}`,
    `  Pool Count: ${data.summary.pool_count}`,
    `  Top Pair: ${data.summary.top_pair}`,
  );
  return lines.join("\n");
}

/**
 * Backtest handler — simple momentum strategy engine.
 * Supports position sizing, slippage, and basic performance metrics.
 */

import { generateDatasetDocument, type OhlcvBar, readDatasetDocument } from "../market/datasets";
import {
  annualizationBasisForInstrument,
  type InstrumentRefLike,
  resolveInstrumentsFromInput,
} from "../market/instruments";

interface BacktestTrade {
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  returnPct: number;
  side: "long" | "short";
}

function loadBars(input: Record<string, unknown>): {
  bars: OhlcvBar[];
  annualizationBasis: number;
  instrument: InstrumentRefLike;
} {
  const datasetPath = input.datasetPath as string | undefined;
  if (datasetPath) {
    try {
      const dataset = readDatasetDocument(datasetPath);
      return {
        bars: dataset.bars,
        annualizationBasis: dataset.tradingDaysPerYear,
        instrument: dataset.instrument,
      };
    } catch {
      throw new Error(`Failed to read dataset at ${datasetPath}`);
    }
  }

  const instruments = resolveInstrumentsFromInput(input);
  if (instruments.length !== 1) {
    throw new Error("Backtest currently supports exactly one instrument at a time.");
  }
  const instrument = instruments[0];
  if (!instrument) {
    throw new Error("Expected one resolved instrument.");
  }
  const dataset = generateDatasetDocument({
    instrument,
    interval: "1d",
    startDate: input.startDate as string | undefined,
    endDate: input.endDate as string | undefined,
  });
  return {
    bars: dataset.bars,
    annualizationBasis: annualizationBasisForInstrument(instrument),
    instrument,
  };
}

function computeSMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    const slice = closes.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

function runMomentumStrategy(
  bars: OhlcvBar[],
  params: Record<string, unknown>,
): { trades: BacktestTrade[]; equity: number[] } {
  const fastPeriod = (params.fast_period as number) ?? 10;
  const slowPeriod = (params.slow_period as number) ?? 30;
  const initialCapital = (params.initialCapital as number) ?? 10_000;
  const slippagePct = (params.slippage as number) ?? 0.001;

  if (bars.length < slowPeriod + 1) {
    throw new Error(
      `Momentum strategy requires at least ${slowPeriod + 1} bars, got ${bars.length}`,
    );
  }

  const closes = bars.map((b) => b.close);
  const fastSMA = computeSMA(closes, fastPeriod);
  const slowSMA = computeSMA(closes, slowPeriod);

  const trades: BacktestTrade[] = [];
  const equity: number[] = [];
  let capital = initialCapital;
  let position: { entryDate: string; entryPrice: number; shares: number } | null = null;

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    if (!bar) {
      continue;
    }
    const fast = fastSMA[i];
    const slow = slowSMA[i];

    if (fast == null || slow == null) {
      equity.push(capital);
      continue;
    }

    // Entry: fast crosses above slow
    if (!position && fast > slow) {
      const entryPrice = bar.close * (1 + slippagePct);
      const shares = capital / entryPrice;
      position = { entryDate: bar.date, entryPrice, shares };
    }
    // Exit: fast crosses below slow
    else if (position && fast < slow) {
      const exitPrice = bar.close * (1 - slippagePct);
      const proceeds = position.shares * exitPrice;
      const returnPct = (exitPrice - position.entryPrice) / position.entryPrice;
      trades.push({
        entryDate: position.entryDate,
        exitDate: bar.date,
        entryPrice: Number(position.entryPrice.toFixed(6)),
        exitPrice: Number(exitPrice.toFixed(6)),
        returnPct: Number(returnPct.toFixed(4)),
        side: "long",
      });
      capital = proceeds;
      position = null;
    }

    // Mark-to-market
    const mtm = position ? position.shares * bar.close : capital;
    equity.push(Number(mtm.toFixed(2)));
  }

  // Close open position at end
  const lastBar = bars[bars.length - 1];
  if (position && lastBar) {
    const exitPrice = lastBar.close * (1 - slippagePct);
    const proceeds = position.shares * exitPrice;
    trades.push({
      entryDate: position.entryDate,
      exitDate: lastBar.date,
      entryPrice: Number(position.entryPrice.toFixed(6)),
      exitPrice: Number(exitPrice.toFixed(6)),
      returnPct: Number(((exitPrice - position.entryPrice) / position.entryPrice).toFixed(4)),
      side: "long",
    });
    capital = proceeds;
  }

  return { trades, equity };
}

function computeMetrics(
  equity: number[],
  trades: BacktestTrade[],
  annualizationBasis: number,
): Record<string, number> {
  if (equity.length === 0) {
    throw new Error("Expected backtest equity series to contain at least one value.");
  }
  const initialCapital = equity[0] ?? 10_000;
  const finalCapital = equity[equity.length - 1] ?? initialCapital;
  const totalReturn = (finalCapital - initialCapital) / initialCapital;

  // Daily returns
  const dailyReturns: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const current = equity[i];
    const previous = equity[i - 1];
    if (current == null || previous == null) {
      throw new Error("Expected adjacent equity points for daily return calculation.");
    }
    dailyReturns.push((current - previous) / previous);
  }

  // Sharpe ratio (annualized)
  const meanReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const stdDev = Math.sqrt(
    dailyReturns.reduce((sum, r) => sum + (r - meanReturn) ** 2, 0) / (dailyReturns.length - 1),
  );
  const sharpe = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(annualizationBasis) : 0;

  // Max drawdown
  const firstEquity = equity[0];
  if (firstEquity == null) {
    throw new Error("Expected the first equity point to be present.");
  }
  let peak = firstEquity;
  let maxDrawdown = 0;
  for (const value of equity) {
    if (value > peak) peak = value;
    const dd = (peak - value) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Win rate
  const wins = trades.filter((t) => t.returnPct > 0).length;
  const winRate = trades.length > 0 ? wins / trades.length : 0;

  // Calmar ratio
  const annualizedReturn = totalReturn * (annualizationBasis / equity.length);
  const calmar = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;

  // Sortino ratio
  const negReturns = dailyReturns.filter((r) => r < 0);
  const downDev = Math.sqrt(
    negReturns.reduce((sum, r) => sum + r ** 2, 0) / Math.max(negReturns.length, 1),
  );
  const sortino = downDev > 0 ? (meanReturn / downDev) * Math.sqrt(annualizationBasis) : 0;

  // Max consecutive loss days
  let maxLossDays = 0;
  let currentLossDays = 0;
  for (const r of dailyReturns) {
    if (r < 0) {
      currentLossDays++;
      maxLossDays = Math.max(maxLossDays, currentLossDays);
    } else {
      currentLossDays = 0;
    }
  }

  return {
    sharpe: Number(sharpe.toFixed(4)),
    maxDrawdown: Number(maxDrawdown.toFixed(4)),
    totalReturn: Number((totalReturn * 100).toFixed(2)),
    winRate: Number(winRate.toFixed(4)),
    tradeCount: trades.length,
    calmar: Number(calmar.toFixed(4)),
    sortino: Number(sortino.toFixed(4)),
    maxConsecutiveLossDays: maxLossDays,
  };
}

export function handleBacktest(input: Record<string, unknown>): Record<string, unknown> {
  const strategy = (input.strategy as string) ?? "momentum";
  const params = (input.params as Record<string, unknown>) ?? {};
  const outputDir = input.outputDir as string | undefined;

  if (strategy !== "momentum") {
    throw new Error(`Unknown strategy: ${strategy}. Available: momentum`);
  }

  const dataset = loadBars(input);
  const instruments =
    (input.instruments as Array<{ displaySymbol: string }> | undefined)?.length ||
    (input.symbols as string[] | undefined)?.length
      ? resolveInstrumentsFromInput(input)
      : [dataset.instrument];
  if (instruments.length !== 1) {
    throw new Error("Backtest currently supports exactly one instrument at a time.");
  }
  const bars = dataset.bars;
  const { trades, equity } = runMomentumStrategy(bars, {
    ...params,
    initialCapital: input.initialCapital,
    slippage: (input.costConfig as Record<string, unknown>)?.slippage
      ? ((input.costConfig as Record<string, unknown>).slippage as Record<string, unknown>).value
      : 0.001,
  });
  const metrics = computeMetrics(equity, trades, dataset.annualizationBasis);

  // Monthly returns
  const monthlyReturns: Record<string, number> = {};
  let lastMonth = "";
  let monthStart = equity[0];
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    if (!bar) {
      continue;
    }
    const month = bar.date.slice(0, 7);
    if (month !== lastMonth && lastMonth) {
      const previousEquity = equity[i - 1];
      if (previousEquity == null || monthStart == null) {
        throw new Error("Expected monthly equity boundary values to be present.");
      }
      monthlyReturns[lastMonth] = Number(
        (((previousEquity - monthStart) / monthStart) * 100).toFixed(2),
      );
      monthStart = previousEquity;
    }
    lastMonth = month;
  }
  if (lastMonth) {
    const finalEquity = equity[equity.length - 1];
    if (finalEquity == null || monthStart == null) {
      throw new Error("Expected final monthly equity values to be present.");
    }
    monthlyReturns[lastMonth] = Number(
      (((finalEquity - monthStart) / monthStart) * 100).toFixed(2),
    );
  }

  if (outputDir) {
    const fs = require("node:fs");
    fs.writeFileSync(
      `${outputDir}/backtest.json`,
      JSON.stringify({ metrics, trades, equity }, null, 2),
    );
  }

  return {
    status: "completed",
    summary: `Backtest: ${metrics.totalReturn}% return, ${metrics.sharpe} sharpe, ${metrics.tradeCount} trades`,
    artifacts: outputDir
      ? [{ path: `${outputDir}/backtest.json`, label: "Backtest results", kind: "json" }]
      : [],
    ...metrics,
    monthlyReturns,
    dailyEquity: equity,
  };
}

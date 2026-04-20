/**
 * Factor computation handler — RSI, MACD, volatility.
 * Includes data point minimum validation per eng review #7.
 */

import { generateDatasetDocument, type OhlcvBar, readDatasetDocument } from "../market/datasets";
import {
  annualizationBasisForInstrument,
  type InstrumentRefLike,
  resolveInstrumentsFromInput,
} from "../market/instruments";

const FACTOR_REGISTRY: Record<
  string,
  { name: string; category: string; description: string; minDataPoints: number; source: string }
> = {
  rsi: {
    name: "RSI",
    category: "momentum",
    description: "Relative Strength Index (14-period)",
    minDataPoints: 15,
    source: "indicator",
  },
  macd: {
    name: "MACD",
    category: "momentum",
    description: "Moving Average Convergence Divergence (12/26/9)",
    minDataPoints: 27,
    source: "indicator",
  },
  volatility: {
    name: "Volatility",
    category: "risk",
    description: "20-day realized volatility (annualized)",
    minDataPoints: 21,
    source: "indicator",
  },
  sma_20: {
    name: "SMA-20",
    category: "trend",
    description: "20-day Simple Moving Average",
    minDataPoints: 20,
    source: "indicator",
  },
  volume_ratio: {
    name: "Volume Ratio",
    category: "liquidity",
    description: "Current volume / 20-day average volume",
    minDataPoints: 20,
    source: "liquidity",
  },
};

export function computeRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) {
    throw new Error(
      `RSI(${period}) requires at least ${period + 1} data points, got ${closes.length}`,
    );
  }
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const current = closes[i];
    const previous = closes[i - 1];
    if (current == null || previous == null) {
      throw new Error("RSI window is missing closing prices.");
    }
    const diff = current - previous;
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const current = closes[i];
    const previous = closes[i - 1];
    if (current == null || previous == null) {
      throw new Error("RSI smoothing window is missing closing prices.");
    }
    const diff = current - previous;
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Number((100 - 100 / (1 + rs)).toFixed(2));
}

export function computeMACD(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9,
): { macd: number; signal: number; histogram: number } {
  if (closes.length < slow + 1) {
    throw new Error(
      `MACD(${fast}/${slow}/${signal}) requires at least ${slow + 1} data points, got ${closes.length}`,
    );
  }
  const ema = (data: number[], period: number): number[] => {
    const first = data[0];
    if (first == null) {
      throw new Error("MACD requires at least one closing price.");
    }
    const k = 2 / (period + 1);
    const result = [first];
    for (let i = 1; i < data.length; i++) {
      const current = data[i];
      const previous = result[i - 1];
      if (current == null || previous == null) {
        throw new Error("EMA series is missing a data point.");
      }
      result.push(current * k + previous * (1 - k));
    }
    return result;
  };
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = emaFast.map((value, index) => {
    const slowValue = emaSlow[index];
    if (slowValue == null) {
      throw new Error("MACD slow EMA is missing a data point.");
    }
    return value - slowValue;
  });
  const signalLine = ema(macdLine.slice(slow - 1), signal);
  const lastMacd = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];
  if (lastMacd == null || lastSignal == null) {
    throw new Error("MACD computation did not produce a final value.");
  }
  return {
    macd: Number(lastMacd.toFixed(6)),
    signal: Number(lastSignal.toFixed(6)),
    histogram: Number((lastMacd - lastSignal).toFixed(6)),
  };
}

export function computeVolatility(closes: number[], period = 20, annualizationBasis = 252): number {
  if (closes.length < period + 1) {
    throw new Error(
      `Volatility(${period}) requires at least ${period + 1} data points, got ${closes.length}`,
    );
  }
  const returns: number[] = [];
  for (let i = closes.length - period; i < closes.length; i++) {
    const current = closes[i];
    const previous = closes[i - 1];
    if (current == null || previous == null) {
      throw new Error("Volatility window is missing closing prices.");
    }
    returns.push(Math.log(current / previous));
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  return Number((Math.sqrt(variance) * Math.sqrt(annualizationBasis) * 100).toFixed(2));
}

export function computeSMA(closes: number[], period = 20): number {
  if (closes.length < period) {
    throw new Error(`SMA(${period}) requires at least ${period} data points, got ${closes.length}`);
  }
  const slice = closes.slice(-period);
  return Number((slice.reduce((a, b) => a + b, 0) / period).toFixed(6));
}

export function computeVolumeRatio(volumes: number[], period = 20): number {
  if (volumes.length < period) {
    throw new Error(
      `Volume Ratio(${period}) requires at least ${period} data points, got ${volumes.length}`,
    );
  }
  const avgVolume = volumes.slice(-period).reduce((a, b) => a + b, 0) / period;
  const current = volumes[volumes.length - 1];
  if (current == null) {
    throw new Error("Volume ratio requires at least one volume observation.");
  }
  return avgVolume > 0 ? Number((current / avgVolume).toFixed(2)) : 0;
}

export function loadDataset(input: Record<string, unknown>): {
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
    throw new Error("Factor compute currently supports exactly one instrument at a time.");
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

export function handleFactorList(_input: Record<string, unknown>): Record<string, unknown> {
  const factors = Object.entries(FACTOR_REGISTRY).map(([id, info]) => ({
    id,
    name: info.name,
    category: info.category,
    description: info.description,
    parameters: [],
    inputFields: ["close"],
    computeMode: "batch",
    source: info.source,
  }));

  return {
    status: "completed",
    summary: `${factors.length} factors available`,
    artifacts: [],
    factors,
  };
}

export function handleFactorCompute(input: Record<string, unknown>): Record<string, unknown> {
  const factorIds = (input.factors as string[]) ?? ["rsi"];
  const dataset = loadDataset(input);
  const instruments =
    (input.instruments as Array<{ displaySymbol: string }> | undefined)?.length ||
    (input.symbols as string[] | undefined)?.length
      ? resolveInstrumentsFromInput(input)
      : [dataset.instrument];
  if (instruments.length !== 1) {
    throw new Error("Factor compute currently supports exactly one instrument at a time.");
  }
  const bars = dataset.bars;
  const closes = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume);
  const outputDir = input.outputDir as string | undefined;

  // Validate data point minimums
  for (const fid of factorIds) {
    const reg = FACTOR_REGISTRY[fid];
    if (reg && bars.length < reg.minDataPoints) {
      throw new Error(
        `${reg.name} requires at least ${reg.minDataPoints} data points, got ${bars.length}`,
      );
    }
  }

  const results: Record<string, unknown> = {};
  const columns: string[] = [];

  for (const fid of factorIds) {
    switch (fid) {
      case "rsi":
        results.rsi = computeRSI(closes);
        columns.push("rsi");
        break;
      case "macd": {
        const macd = computeMACD(closes);
        results.macd = macd.macd;
        results.macd_signal = macd.signal;
        results.macd_histogram = macd.histogram;
        columns.push("macd", "macd_signal", "macd_histogram");
        break;
      }
      case "volatility":
        results.volatility = computeVolatility(closes, 20, dataset.annualizationBasis);
        columns.push("volatility");
        break;
      case "sma_20":
        results.sma_20 = computeSMA(closes);
        columns.push("sma_20");
        break;
      case "volume_ratio":
        results.volume_ratio = computeVolumeRatio(volumes);
        columns.push("volume_ratio");
        break;
      default:
        throw new Error(`Unknown factor: ${fid}`);
    }
  }

  if (outputDir) {
    const fs = require("node:fs");
    fs.writeFileSync(`${outputDir}/factors.json`, JSON.stringify(results, null, 2));
  }

  return {
    status: "completed",
    summary: `Computed ${factorIds.length} factor(s) on ${bars.length} bars`,
    artifacts: outputDir
      ? [{ path: `${outputDir}/factors.json`, label: "Factor values", kind: "json" }]
      : [],
    datasetRows: bars.length,
    factorCount: factorIds.length,
    symbolCount: instruments.length,
    factorColumns: columns,
    ...results,
  };
}

import { writeFileSync } from "node:fs";
import {
  CostModelSchema,
  FactorDefinitionSchema,
  FactorEvaluationArtifactSchema,
  icHalfLifeDays,
  LiquidityAssumptionsSchema,
} from "@tonquant/core";
import { z } from "zod";
import type { DatasetDocument, OhlcvBar } from "../market/datasets";
import { type InstrumentRefLike, resolveInstrumentsFromInput } from "../market/instruments";
import { resolveDatasetForRequest } from "./data";
import {
  computeMACD,
  computeRSI,
  computeSMA,
  computeVolatility,
  computeVolumeRatio,
} from "./factor";

type EvaluationFrequency = "daily" | "weekly" | "monthly";

interface DatasetWithInstrument extends DatasetDocument {
  instrument: InstrumentRefLike;
}

interface CrossSectionSample {
  symbol: string;
  score: number;
  forwardReturn: number;
  dollarVolume: number;
  peerScores: Record<string, number>;
}

interface CrossSectionPoint {
  date: string;
  samples: CrossSectionSample[];
}

const SUPPORTED_FORMULAS = [
  "return_5d",
  "return_20d",
  "rsi",
  "macd",
  "macd_histogram",
  "volatility",
  "sma_gap_20",
  "volume_ratio",
] as const;

const DEFAULT_PEER_FORMULAS = [
  "return_5d",
  "return_20d",
  "rsi",
  "macd_histogram",
  "volatility",
  "sma_gap_20",
  "volume_ratio",
];

function assertSupportedFormula(formula: string): void {
  if ((SUPPORTED_FORMULAS as readonly string[]).includes(formula)) {
    return;
  }
  throw new Error(
    `Unsupported signalFormula '${formula}'. Supported values: ${SUPPORTED_FORMULAS.join(", ")}`,
  );
}

function parseHorizonSteps(horizon: string): number {
  const match = /^(\d+)([dwm])$/iu.exec(horizon.trim());
  if (!match) {
    return 1;
  }
  const amount = Number.parseInt(match[1] ?? "1", 10);
  const unit = (match[2] ?? "d").toLowerCase();
  if (unit === "w") return amount * 5;
  if (unit === "m") return amount * 21;
  return amount;
}

function evaluationFrequencyFor(timeframe: string): EvaluationFrequency {
  if (timeframe.endsWith("m")) {
    return "monthly";
  }
  if (timeframe.endsWith("w")) {
    return "weekly";
  }
  return "daily";
}

function inferMarketType(
  assetClass: string,
  marketRegion: string,
): "equity" | "crypto" | "ton-defi" | "generic" {
  const normalizedAssetClass = assetClass.trim().toLowerCase();
  const normalizedRegion = marketRegion.trim().toLowerCase();
  if (normalizedRegion === "ton") {
    return "ton-defi";
  }
  if (normalizedAssetClass === "equity") {
    return "equity";
  }
  if (normalizedAssetClass === "crypto") {
    return normalizedRegion === "ton" ? "ton-defi" : "crypto";
  }
  return "generic";
}

function holdingBucketFor(horizon: string): "short" | "medium" | "long" {
  const days = parseHorizonSteps(horizon);
  if (days <= 5) return "short";
  if (days <= 20) return "medium";
  return "long";
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function std(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function rank(values: number[]): number[] {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((left, right) => left.value - right.value);
  const result = new Array<number>(values.length).fill(0);
  for (let cursor = 0; cursor < sorted.length; ) {
    let end = cursor + 1;
    while (end < sorted.length && sorted[end]?.value === sorted[cursor]?.value) {
      end += 1;
    }
    const averageRank = (cursor + end - 1) / 2 + 1;
    for (let index = cursor; index < end; index += 1) {
      const originalIndex = sorted[index]?.index;
      if (originalIndex != null) {
        result[originalIndex] = averageRank;
      }
    }
    cursor = end;
  }
  return result;
}

function pearsonCorrelation(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length <= 1) return 0;
  const leftMean = mean(left);
  const rightMean = mean(right);
  let numerator = 0;
  let leftDenominator = 0;
  let rightDenominator = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    const leftDelta = leftValue - leftMean;
    const rightDelta = rightValue - rightMean;
    numerator += leftDelta * rightDelta;
    leftDenominator += leftDelta ** 2;
    rightDenominator += rightDelta ** 2;
  }
  const denominator = Math.sqrt(leftDenominator * rightDenominator);
  return denominator === 0 ? 0 : numerator / denominator;
}

function spearmanCorrelation(left: number[], right: number[]): number {
  return pearsonCorrelation(rank(left), rank(right));
}

function maxDrawdownFromReturns(returns: number[]): number {
  let peak = 1;
  let equity = 1;
  let maxDrawdown = 0;
  for (const value of returns) {
    equity *= 1 + value;
    peak = Math.max(peak, equity);
    if (peak !== 0) {
      maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak);
    }
  }
  return maxDrawdown;
}

function factorScoreSeries(
  bars: OhlcvBar[],
  formula: string,
  annualizationBasis: number,
): Array<number | null> {
  assertSupportedFormula(formula);
  const closes = bars.map((bar) => bar.close);
  const volumes = bars.map((bar) => bar.volume);
  return bars.map((_, index) => {
    const closesSlice = closes.slice(0, index + 1);
    const volumeSlice = volumes.slice(0, index + 1);
    switch (formula) {
      case "return_5d":
        if (index < 5) return null;
        return Number(((closes[index] ?? 0) / (closes[index - 5] ?? 1) - 1).toFixed(6));
      case "return_20d":
        if (index < 20) return null;
        return Number(((closes[index] ?? 0) / (closes[index - 20] ?? 1) - 1).toFixed(6));
      case "rsi":
        if (closesSlice.length < 15) return null;
        return computeRSI(closesSlice);
      case "macd":
        if (closesSlice.length < 27) return null;
        return computeMACD(closesSlice).macd;
      case "macd_histogram":
        if (closesSlice.length < 27) return null;
        return computeMACD(closesSlice).histogram;
      case "volatility":
        if (closesSlice.length < 21) return null;
        return computeVolatility(closesSlice, 20, annualizationBasis);
      case "sma_gap_20":
        if (closesSlice.length < 20) return null;
        return Number(((closes[index] ?? 0) / computeSMA(closesSlice, 20) - 1).toFixed(6));
      case "volume_ratio":
        if (volumeSlice.length < 20) return null;
        return computeVolumeRatio(volumeSlice, 20);
      default:
        return null;
    }
  });
}

function buildCrossSections(params: {
  datasets: DatasetWithInstrument[];
  formula: string;
  direction: "higher_is_better" | "lower_is_better";
  horizonSteps: number;
  peerFormulas: string[];
}): CrossSectionPoint[] {
  const formulaCache = new Map<string, Array<number | null>>();
  const rowsByDate = new Map<string, CrossSectionSample[]>();

  const seriesFor = (dataset: DatasetWithInstrument, formula: string): Array<number | null> => {
    const key = `${dataset.instrument.id}:${formula}`;
    const cached = formulaCache.get(key);
    if (cached) return cached;
    const series = factorScoreSeries(dataset.bars, formula, dataset.tradingDaysPerYear);
    formulaCache.set(key, series);
    return series;
  };

  for (const dataset of params.datasets) {
    const primarySeries = seriesFor(dataset, params.formula);
    const peerSeries = Object.fromEntries(
      params.peerFormulas.map((formula) => [formula, seriesFor(dataset, formula)]),
    );
    for (let index = 0; index + params.horizonSteps < dataset.bars.length; index += 1) {
      const score = primarySeries[index];
      const currentBar = dataset.bars[index];
      const forwardBar = dataset.bars[index + params.horizonSteps];
      if (score == null || !currentBar || !forwardBar || currentBar.close === 0) {
        continue;
      }
      const date = currentBar.date;
      const forwardReturn = forwardBar.close / currentBar.close - 1;
      const row: CrossSectionSample = {
        symbol: dataset.instrument.displaySymbol,
        score: params.direction === "higher_is_better" ? score : -score,
        forwardReturn: Number(forwardReturn.toFixed(6)),
        dollarVolume: Number((currentBar.close * currentBar.volume).toFixed(2)),
        peerScores: {},
      };
      for (const formula of params.peerFormulas) {
        const peerValue = peerSeries[formula]?.[index];
        if (peerValue != null) {
          row.peerScores[formula] = peerValue;
        }
      }
      const rows = rowsByDate.get(date) ?? [];
      rows.push(row);
      rowsByDate.set(date, rows);
    }
  }

  return [...rowsByDate.entries()]
    .map(([date, samples]) => ({ date, samples }))
    .sort((left, right) => left.date.localeCompare(right.date))
    .filter((point) => point.samples.length >= 2);
}

function splitDates(
  points: CrossSectionPoint[],
  trainRatio: number,
  validationRatio: number,
): {
  train: CrossSectionPoint[];
  validation: CrossSectionPoint[];
  test: CrossSectionPoint[];
} {
  if (points.length < 5) {
    throw new Error("Factor evaluation requires at least 5 aligned cross-sectional dates.");
  }
  const trainCount = Math.max(1, Math.floor(points.length * trainRatio));
  const validationCount = Math.max(1, Math.floor(points.length * validationRatio));
  const cappedTrain = Math.min(trainCount, Math.max(1, points.length - 2));
  const cappedValidation = Math.min(validationCount, Math.max(1, points.length - cappedTrain - 1));
  const train = points.slice(0, cappedTrain);
  const validation = points.slice(cappedTrain, cappedTrain + cappedValidation);
  const test = points.slice(cappedTrain + cappedValidation);
  if (test.length === 0) {
    throw new Error("Factor evaluation requires a non-empty OOS test split.");
  }
  return { train, validation, test };
}

function pointMetric(point: CrossSectionPoint) {
  const scores = point.samples.map((sample) => sample.score);
  const forwardReturns = point.samples.map((sample) => sample.forwardReturn);
  const rankIc = spearmanCorrelation(scores, forwardReturns);
  const ic = pearsonCorrelation(scores, forwardReturns);

  const sorted = [...point.samples].sort((left, right) => left.score - right.score);
  const bucketSize = Math.max(1, Math.floor(sorted.length / 5));
  const quantileReturns = Array.from({ length: 5 }, (_, index) => {
    const start = index * bucketSize;
    const end = index === 4 ? sorted.length : Math.min(sorted.length, start + bucketSize);
    const bucket = sorted.slice(start, end);
    return mean(bucket.map((sample) => sample.forwardReturn));
  });
  const bottom = sorted.slice(0, bucketSize);
  const top = sorted.slice(-bucketSize);
  const spread =
    mean(top.map((sample) => sample.forwardReturn)) -
    mean(bottom.map((sample) => sample.forwardReturn));

  return {
    rankIc,
    ic,
    spread,
    topSymbols: new Set(top.map((sample) => sample.symbol)),
    averageDollarVolume: mean(point.samples.map((sample) => sample.dollarVolume)),
    quantileReturns,
    universeSize: point.samples.length,
  };
}

function turnoverSeries(points: CrossSectionPoint[]): number[] {
  const series = points.map(pointMetric);
  const turnover: number[] = [];
  for (let index = 1; index < series.length; index += 1) {
    const previous = series[index - 1];
    const current = series[index];
    if (!previous || !current) continue;
    const departed = [...previous.topSymbols].filter(
      (symbol) => !current.topSymbols.has(symbol),
    ).length;
    const entered = [...current.topSymbols].filter(
      (symbol) => !previous.topSymbols.has(symbol),
    ).length;
    turnover.push((departed + entered) / Math.max(previous.topSymbols.size, 1));
  }
  return turnover;
}

function peerCorrelation(points: CrossSectionPoint[]): {
  maxAbs: number;
  avgAbs: number;
  bucket: "unique" | "typical" | "crowded";
  universeSize: number;
} {
  const allPeerValues = new Map<string, number[]>();
  const primaryValues = new Map<string, number[]>();

  for (const point of points) {
    for (const sample of point.samples) {
      for (const [formula, value] of Object.entries(sample.peerScores)) {
        const peer = allPeerValues.get(formula) ?? [];
        peer.push(value);
        allPeerValues.set(formula, peer);

        const primary = primaryValues.get(formula) ?? [];
        primary.push(sample.score);
        primaryValues.set(formula, primary);
      }
    }
  }

  const correlations = [...allPeerValues.entries()].map(([formula, values]) =>
    Math.abs(pearsonCorrelation(primaryValues.get(formula) ?? [], values)),
  );
  const maxAbs = correlations.length ? Math.max(...correlations) : 0;
  const avgAbs = correlations.length ? mean(correlations) : 0;
  const bucket = maxAbs < 0.3 ? "unique" : maxAbs < 0.6 ? "typical" : "crowded";

  return {
    maxAbs: Number(maxAbs.toFixed(6)),
    avgAbs: Number(avgAbs.toFixed(6)),
    bucket,
    universeSize: correlations.length,
  };
}

function tStat(values: number[]): number {
  if (values.length <= 1) return 0;
  const sampleStd = std(values);
  if (sampleStd === 0) return 0;
  return (mean(values) / (sampleStd / Math.sqrt(values.length))).valueOf();
}

function isMonotonic(values: number[]): boolean {
  for (let index = 1; index < values.length; index += 1) {
    if ((values[index] ?? 0) < (values[index - 1] ?? 0)) {
      return false;
    }
  }
  return true;
}

function stabilityMetrics(
  testMetrics: Array<ReturnType<typeof pointMetric>>,
  holdingHorizon: string,
): {
  positivePeriodShare: number;
  worstSubperiodRankIc: number;
  subperiodCount: number;
  quantileMonotonicity: number;
  primaryHoldingBucket: "short" | "medium" | "long";
} {
  const rankIcSeries = testMetrics.map((metric) => metric.rankIc);
  const positivePeriodShare =
    rankIcSeries.length === 0
      ? 0
      : rankIcSeries.filter((value) => value > 0).length / rankIcSeries.length;
  const quantileMonotonicity =
    testMetrics.length === 0
      ? 0
      : testMetrics.filter((metric) => isMonotonic(metric.quantileReturns)).length /
        testMetrics.length;
  const subperiodCount = Math.max(1, Math.min(4, rankIcSeries.length));
  const chunkSize = Math.max(1, Math.ceil(rankIcSeries.length / subperiodCount));
  const worstSubperiodRankIc = Array.from({ length: subperiodCount }, (_, index) =>
    rankIcSeries.slice(index * chunkSize, (index + 1) * chunkSize),
  )
    .filter((chunk) => chunk.length > 0)
    .reduce((worst, chunk) => Math.min(worst, mean(chunk)), Number.POSITIVE_INFINITY);

  return {
    positivePeriodShare: Number(positivePeriodShare.toFixed(6)),
    worstSubperiodRankIc: Number(
      (Number.isFinite(worstSubperiodRankIc) ? worstSubperiodRankIc : 0).toFixed(6),
    ),
    subperiodCount,
    quantileMonotonicity: Number(quantileMonotonicity.toFixed(6)),
    primaryHoldingBucket: holdingBucketFor(holdingHorizon),
  };
}

function decayMetrics(
  datasets: DatasetWithInstrument[],
  definition: { signalFormula: string; signalDirection: "higher_is_better" | "lower_is_better" },
): Array<{ horizon: string; rankIc: number; ic: number }> {
  const horizons = ["1d", "5d", "10d", "20d", "60d"];
  return horizons
    .map((horizon) => {
      const points = buildCrossSections({
        datasets,
        formula: definition.signalFormula,
        direction: definition.signalDirection,
        horizonSteps: parseHorizonSteps(horizon),
        peerFormulas: [],
      });
      if (points.length === 0) return null;
      const metrics = points.map(pointMetric);
      return {
        horizon,
        rankIc: Number(mean(metrics.map((metric) => metric.rankIc)).toFixed(6)),
        ic: Number(mean(metrics.map((metric) => metric.ic)).toFixed(6)),
      };
    })
    .filter((point): point is { horizon: string; rankIc: number; ic: number } => point !== null);
}

function referenceBacktestMetrics(returns: number[], annualizationBasis: number) {
  const annualizedReturn = mean(returns) * annualizationBasis;
  const volatility = std(returns);
  const sharpe =
    volatility === 0 ? 0 : (mean(returns) / volatility) * Math.sqrt(annualizationBasis);
  const negativeReturns = returns.filter((value) => value < 0);
  const downsideDeviation =
    negativeReturns.length === 0 ? 0 : Math.sqrt(mean(negativeReturns.map((value) => value ** 2)));
  const sortino =
    downsideDeviation === 0
      ? 0
      : (mean(returns) / downsideDeviation) * Math.sqrt(annualizationBasis);
  const maxDrawdown = maxDrawdownFromReturns(returns);
  const calmar = maxDrawdown === 0 ? 0 : annualizedReturn / maxDrawdown;
  const winRate =
    returns.length === 0
      ? 0
      : returns.filter((value) => value > 0).length / Math.max(returns.length, 1);
  return {
    arr: Number(annualizedReturn.toFixed(6)),
    sharpe: Number(sharpe.toFixed(6)),
    calmar: Number(calmar.toFixed(6)),
    sortino: Number(sortino.toFixed(6)),
    winRate: Number(winRate.toFixed(6)),
    ytd: undefined,
    maxDrawdown: Number(maxDrawdown.toFixed(6)),
  };
}

export function deflatedRankIcLowerBound(
  rankIcOosMean: number,
  sampleCount: number,
  nTrials: number,
): number | undefined {
  if (
    !Number.isFinite(rankIcOosMean) ||
    Math.abs(rankIcOosMean) > 1 ||
    !Number.isInteger(sampleCount) ||
    sampleCount < 3 ||
    !Number.isInteger(nTrials) ||
    nTrials < 1
  ) {
    return undefined;
  }

  const varianceTerm = Math.max(1 - rankIcOosMean * rankIcOosMean, 0);
  const standardError = Math.sqrt(varianceTerm / (sampleCount - 2));
  const penaltyZ = nTrials <= 1 ? 0 : Math.sqrt(2 * Math.log(nTrials));
  const magnitude = Math.max(0, Math.abs(rankIcOosMean) - penaltyZ * standardError);

  if (magnitude === 0) {
    return 0;
  }

  return Number((Math.sign(rankIcOosMean) * magnitude).toFixed(6));
}

export async function handleFactorEvaluate(
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const definition = FactorDefinitionSchema.parse(input.definition);
  const liquidityAssumptions = LiquidityAssumptionsSchema.parse(input.liquidityAssumptions ?? {});
  const costModel = CostModelSchema.parse(input.costModel);
  const nTrials = z.number().int().positive().optional().parse(input.nTrials);
  assertSupportedFormula(definition.signalFormula);
  const inferredMarketType = inferMarketType(
    definition.universe.assetClass,
    definition.universe.marketRegion,
  );
  if (liquidityAssumptions.marketType !== inferredMarketType) {
    throw new Error(
      `Liquidity assumptions marketType '${liquidityAssumptions.marketType}' does not match inferred market type '${inferredMarketType}'.`,
    );
  }
  if (costModel.marketType !== inferredMarketType) {
    throw new Error(
      `Cost model marketType '${costModel.marketType}' does not match inferred market type '${inferredMarketType}'.`,
    );
  }

  const instruments = resolveInstrumentsFromInput({
    ...input,
    assetClass: input.assetClass ?? definition.universe.assetClass,
    marketRegion: input.marketRegion ?? definition.universe.marketRegion,
  });
  const datasets = (await Promise.all(
    instruments.map((instrument) =>
      resolveDatasetForRequest({
        instrument,
        interval: definition.timeframe,
        startDate: input.startDate as string | undefined,
        endDate: input.endDate as string | undefined,
      }),
    ),
  )) as DatasetWithInstrument[];

  const peerFormulas = DEFAULT_PEER_FORMULAS.filter(
    (formula) => formula !== definition.signalFormula,
  );
  const horizonSteps = parseHorizonSteps(definition.holdingHorizon);
  const points = buildCrossSections({
    datasets,
    formula: definition.signalFormula,
    direction: definition.signalDirection,
    horizonSteps,
    peerFormulas,
  });
  const splits = splitDates(
    points,
    Number(input.trainRatio ?? 0.6),
    Number(input.validationRatio ?? 0.2),
  );

  const trainMetrics = splits.train.map(pointMetric);
  const testMetrics = splits.test.map(pointMetric);
  const testRankIcSeries = testMetrics.map((metric) => metric.rankIc);
  const testIcSeries = testMetrics.map((metric) => metric.ic);
  const testSpreadSeries = testMetrics.map((metric) => metric.spread);
  const stability = stabilityMetrics(testMetrics, definition.holdingHorizon);
  const turnover = turnoverSeries(splits.test);
  const avgUniverseSize = mean(testMetrics.map((metric) => metric.universeSize));
  const avgDollarVolume = mean(testMetrics.map((metric) => metric.averageDollarVolume));
  const peer = peerCorrelation(splits.test);
  const capacityValue =
    liquidityAssumptions.marketType === "ton-defi"
      ? liquidityAssumptions.poolDepthUsd * liquidityAssumptions.maxPoolParticipationPct
      : avgDollarVolume * liquidityAssumptions.advParticipationPct;

  const provenance = {
    trainPeriod: {
      start: splits.train[0]?.date ?? splits.test[0]?.date ?? "",
      end: splits.train[splits.train.length - 1]?.date ?? splits.test[0]?.date ?? "",
    },
    validationPeriod: {
      start: splits.validation[0]?.date ?? splits.test[0]?.date ?? "",
      end:
        splits.validation[splits.validation.length - 1]?.date ??
        splits.test[splits.test.length - 1]?.date ??
        "",
    },
    testPeriod: {
      start: splits.test[0]?.date ?? "",
      end: splits.test[splits.test.length - 1]?.date ?? "",
    },
    evaluationFrequency: evaluationFrequencyFor(definition.timeframe),
    sampleCount: splits.test.length,
    averageUniverseSize: Number(avgUniverseSize.toFixed(2)),
    pointInTime: Boolean(input.pointInTime),
    survivorshipBiasControlled: Boolean(input.survivorshipBiasControlled),
    costModel,
    codeVersion: String(input.codeVersion ?? "local"),
  };
  const rankIcOosMean = Number(mean(testRankIcSeries).toFixed(6));
  const icOosMean = Number(mean(testIcSeries).toFixed(6));
  const icDecay = decayMetrics(datasets, definition);
  const halfLifeDays = icHalfLifeDays(icDecay);
  const deflatedRankIc =
    nTrials === undefined
      ? undefined
      : deflatedRankIcLowerBound(rankIcOosMean, provenance.sampleCount, nTrials);

  const evaluation = FactorEvaluationArtifactSchema.parse({
    definition,
    metrics: {
      factorQuality: {
        rankIcOosMean,
        rankIcOosIcir: Number(
          (std(testRankIcSeries) === 0
            ? 0
            : mean(testRankIcSeries) / std(testRankIcSeries)
          ).toFixed(6),
        ),
        rankIcOosTstat: Number(tStat(testRankIcSeries).toFixed(6)),
        icOosMean,
        icOosIcir: Number(
          (std(testIcSeries) === 0 ? 0 : mean(testIcSeries) / std(testIcSeries)).toFixed(6),
        ),
        icOosTstat: Number(tStat(testIcSeries).toFixed(6)),
        quantileSpreadQ5Q1: Number(mean(testSpreadSeries).toFixed(6)),
        icDecay,
        oosIsRatio: Number(
          (
            Math.abs(mean(testRankIcSeries)) /
            Math.max(Math.abs(mean(trainMetrics.map((metric) => metric.rankIc))), 1e-9)
          ).toFixed(6),
        ),
        halfLifeDays,
        ...(deflatedRankIc === undefined ? {} : { deflatedRankIc }),
        ...(nTrials === undefined ? {} : { nTrials }),
        stability,
      },
      implementationProfile: {
        turnoverTwoWay: Number(mean(turnover).toFixed(6)),
        capacityMethod:
          liquidityAssumptions.marketType === "ton-defi"
            ? "pool_participation"
            : "adv_participation",
        capacityValue: Number(capacityValue.toFixed(2)),
        liquidityAssumptions,
        peerCorrelation: peer,
      },
    },
    provenance,
    referenceBacktest: {
      benchmark: "simple_long_short_decile",
      netOrGross: "gross",
      costAssumptions: provenance.costModel.notes,
      strategyMetrics: referenceBacktestMetrics(
        testSpreadSeries,
        datasets[0]?.tradingDaysPerYear ?? 252,
      ),
    },
  });

  const outputDir = input.outputDir as string | undefined;
  if (outputDir) {
    writeFileSync(
      `${outputDir}/factor-evaluation.json`,
      `${JSON.stringify(evaluation, null, 2)}\n`,
      "utf-8",
    );
  }

  return {
    status: "completed",
    summary: `Evaluated ${definition.signalFormula} across ${instruments.length} instruments on ${splits.test.length} OOS dates`,
    artifacts: outputDir
      ? [{ path: `${outputDir}/factor-evaluation.json`, label: "Factor evaluation", kind: "json" }]
      : [],
    symbolCount: instruments.length,
    evaluation,
  };
}

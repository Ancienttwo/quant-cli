/**
 * Data fetch handler — resolves instruments and writes normalized dataset documents.
 * Global crypto providers (OKX/Binance/Hyperliquid) and equity providers (YFinance/OpenBB)
 * run live transports; unsupported combinations still fail before transport.
 */

import { join } from "node:path";
import { fetchMarketCandlesData } from "@tonquant/core";
import {
  computeRequestedBars,
  createDatasetDocument,
  datasetFileName,
  findLatestDataset,
  generateDatasetDocument,
  listDatasets,
  writeDatasetDocument,
} from "../market/datasets";
import { resolveInstrumentsFromInput } from "../market/instruments";
import * as openbbMarket from "../market/openbb";
import * as yfinanceMarket from "../market/yfinance";

function datasetSummary(dataset: {
  instrument: { displaySymbol: string };
  interval: string;
  path?: string;
  bars: Array<{ date: string }>;
}) {
  const firstBar = dataset.bars[0];
  const lastBar = dataset.bars[dataset.bars.length - 1];
  return {
    symbol: dataset.instrument.displaySymbol,
    instrument: dataset.instrument,
    interval: dataset.interval,
    path: dataset.path ?? "(not cached yet)",
    barCount: dataset.bars.length,
    startDate: firstBar?.date,
    endDate: lastBar?.date,
  };
}

export async function resolveDatasetForRequest(input: {
  instrument: ReturnType<typeof resolveInstrumentsFromInput>[number];
  interval: string;
  startDate?: string;
  endDate?: string;
}) {
  if (
    input.instrument.provider === "okx" ||
    input.instrument.provider === "binance" ||
    input.instrument.provider === "hyperliquid"
  ) {
    const limit = computeRequestedBars(input.startDate, input.endDate, input.interval);
    const candles = await fetchMarketCandlesData(input.instrument.displaySymbol, {
      provider: input.instrument.provider,
      interval: input.interval,
      startDate: input.startDate,
      endDate: input.endDate,
      limit,
    });
    return createDatasetDocument({
      instrument: input.instrument,
      interval: input.interval,
      bars: candles.candles.map((candle) => ({
        date:
          input.interval === "1d"
            ? candle.open_time.slice(0, 10)
            : candle.open_time.slice(0, 16).replace("T", " "),
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
        volume: Math.round(Number(candle.volume)),
      })),
    });
  }
  if (input.instrument.provider === "yfinance") {
    return yfinanceMarket.fetchYFinanceDatasetDocument(input);
  }
  if (input.instrument.provider === "openbb") {
    return openbbMarket.fetchOpenBBDatasetDocument(input);
  }
  return generateDatasetDocument(input);
}

export async function handleDataFetch(
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const instruments = resolveInstrumentsFromInput(input);
  const interval = (input.interval as string | undefined) ?? "1d";
  const startDate = input.startDate as string | undefined;
  const endDate = input.endDate as string | undefined;
  const outputDir = input.outputDir as string | undefined;
  const datasets = await Promise.all(
    instruments.map((instrument) =>
      resolveDatasetForRequest({
        instrument,
        interval,
        startDate,
        endDate,
      }),
    ),
  );
  const datasetSummaries = datasets.map((dataset) =>
    datasetSummary({
      ...dataset,
      path: outputDir == null ? undefined : join(outputDir, datasetFileName(dataset.instrument)),
    }),
  );
  const totalBars = datasets.reduce((sum, dataset) => sum + dataset.bars.length, 0);
  const artifacts =
    outputDir == null
      ? []
      : datasets.map((dataset) => {
          const path = join(outputDir, datasetFileName(dataset.instrument));
          writeDatasetDocument(path, dataset);
          return {
            path,
            label: `${dataset.instrument.displaySymbol} dataset`,
            kind: "dataset" as const,
          };
        });

  const preview = datasets[0];
  if (!preview) {
    throw new Error("Expected at least one dataset to be generated.");
  }

  return {
    status: "completed",
    summary: `Fetched ${totalBars} bars for ${instruments.length} instrument(s)`,
    artifacts,
    instruments,
    datasets: datasetSummaries,
    fetchedSymbols: instruments.map((instrument) => instrument.displaySymbol),
    cacheHits: 0,
    cacheMisses: instruments.length,
    barCount: totalBars,
    cacheFiles: artifacts.map((artifact) => artifact.path),
    symbolCount: instruments.length,
    interval,
    dateRange:
      preview.bars.length > 0
        ? {
            start: preview.bars[0]?.date,
            end: preview.bars[preview.bars.length - 1]?.date,
          }
        : undefined,
  };
}

export function handleDataList(input: Record<string, unknown>): Record<string, unknown> {
  const outputDir = input.outputDir as string | undefined;
  if (!outputDir) {
    return {
      status: "completed",
      summary: "No cached datasets (missing output context)",
      artifacts: [],
      datasets: [],
    };
  }

  const datasets = listDatasets(outputDir).map(datasetSummary);
  return {
    status: "completed",
    summary: datasets.length ? `${datasets.length} cached dataset(s) found` : "No cached datasets",
    artifacts: [],
    datasets,
  };
}

export async function handleDataInfo(
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const outputDir = input.outputDir as string | undefined;
  const instrument = resolveInstrumentsFromInput({
    ...input,
    symbols: [input.symbol as string],
  })[0];
  if (!instrument) {
    throw new Error("Expected symbol resolution to return one instrument.");
  }
  const interval = (input.interval as string | undefined) ?? "1d";

  const cached =
    outputDir == null
      ? null
      : findLatestDataset(
          outputDir,
          (dataset) =>
            dataset.instrument.id === instrument.id &&
            dataset.instrument.provider === instrument.provider &&
            dataset.interval === interval,
        );

  if (cached) {
    return {
      status: "completed",
      summary: `Dataset info for ${instrument.displaySymbol}`,
      artifacts: [],
      dataset: datasetSummary(cached),
    };
  }

  const preview = await resolveDatasetForRequest({
    instrument,
    interval,
    startDate: input.startDate as string | undefined,
    endDate: input.endDate as string | undefined,
  });
  return {
    status: "completed",
    summary: `Dataset preview for ${instrument.displaySymbol}`,
    artifacts: [],
    dataset: datasetSummary({
      ...preview,
      path: "(not cached yet)",
    }),
  };
}

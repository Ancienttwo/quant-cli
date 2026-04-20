import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  annualizationBasisForInstrument,
  type InstrumentRefLike,
  instrumentIdFor,
  providerForInstrument,
} from "./instruments";

export interface OhlcvBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DatasetDocument {
  schemaVersion: 1;
  instrument: InstrumentRefLike;
  provider: string;
  interval: string;
  generatedAt: string;
  tradingDaysPerYear: number;
  bars: OhlcvBar[];
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function nextTimestamp(date: Date, interval: string): Date {
  const ms = interval === "15m" ? 15 * 60_000 : interval === "1h" ? 60 * 60_000 : 24 * 60 * 60_000;
  return new Date(date.getTime() + ms);
}

function basePriceFor(instrument: InstrumentRefLike): number {
  if (instrument.assetClass === "crypto") {
    return instrument.displaySymbol.includes("TON") ? 3.5 : 1.0;
  }
  return 100;
}

function volumeBaseFor(instrument: InstrumentRefLike): number {
  return instrument.assetClass === "crypto" ? 1_000_000 : 250_000;
}

function generateBars(
  instrument: InstrumentRefLike,
  interval: string,
  days: number,
  startDate?: string,
): OhlcvBar[] {
  const bars: OhlcvBar[] = [];
  const start = startDate ? new Date(startDate) : new Date(Date.now() - days * 86400_000);
  let cursor = new Date(start);
  let price = basePriceFor(instrument);
  const baseVolume = volumeBaseFor(instrument);
  const target = Math.max(days, 1);

  while (bars.length < target) {
    if (instrument.calendarId !== "24-7" && isWeekend(cursor)) {
      cursor = nextTimestamp(cursor, "1d");
      continue;
    }

    const dateStr =
      interval === "1d"
        ? cursor.toISOString().slice(0, 10)
        : cursor.toISOString().slice(0, 16).replace("T", " ");
    const drift = instrument.assetClass === "crypto" ? 0.06 : 0.03;
    const change = (Math.random() - 0.48) * drift;
    const open = price;
    price = price * (1 + change);
    const close = price;
    const high = Math.max(open, close) * (1 + Math.random() * 0.02);
    const low = Math.min(open, close) * (1 - Math.random() * 0.02);
    const volume = baseVolume + Math.random() * baseVolume * 4;

    bars.push({
      date: dateStr,
      open: Number(open.toFixed(6)),
      high: Number(high.toFixed(6)),
      low: Number(low.toFixed(6)),
      close: Number(close.toFixed(6)),
      volume: Math.round(volume),
    });
    cursor = nextTimestamp(cursor, interval);
  }

  return bars;
}

export function computeRequestedBars(
  startDate: string | undefined,
  endDate: string | undefined,
  _interval: string,
): number {
  if (!startDate || !endDate) return 90;
  const diffMs = new Date(endDate).getTime() - new Date(startDate).getTime();
  return Math.max(Math.ceil(diffMs / 86400_000), 1);
}

export function createDatasetDocument(input: {
  instrument: InstrumentRefLike;
  interval: string;
  bars: OhlcvBar[];
}): DatasetDocument {
  const provider = input.instrument.provider ?? providerForInstrument(input.instrument);
  const instrument = {
    ...input.instrument,
    id: instrumentIdFor({
      assetClass: input.instrument.assetClass,
      marketRegion: input.instrument.marketRegion,
      venue: input.instrument.venue,
      provider,
      displaySymbol: input.instrument.displaySymbol,
    }),
    provider,
  };
  return {
    schemaVersion: 1,
    instrument,
    provider,
    interval: input.interval,
    generatedAt: new Date().toISOString(),
    tradingDaysPerYear: annualizationBasisForInstrument(input.instrument),
    bars: input.bars,
  };
}

export function generateDatasetDocument(input: {
  instrument: InstrumentRefLike;
  interval: string;
  startDate?: string;
  endDate?: string;
}): DatasetDocument {
  const days = computeRequestedBars(input.startDate, input.endDate, input.interval);
  return createDatasetDocument({
    instrument: input.instrument,
    interval: input.interval,
    bars: generateBars(input.instrument, input.interval, days, input.startDate),
  });
}

export function writeDatasetDocument(outputPath: string, dataset: DatasetDocument): void {
  writeFileSync(outputPath, JSON.stringify(dataset, null, 2), "utf-8");
}

export function readDatasetDocument(datasetPath: string): DatasetDocument {
  const raw = readFileSync(datasetPath, "utf-8");
  const parsed = JSON.parse(raw) as DatasetDocument | OhlcvBar[];
  if (Array.isArray(parsed)) {
    return {
      schemaVersion: 1,
      instrument: {
        id: "crypto:ton:stonfi:synthetic:legacy-ton-usdt",
        assetClass: "crypto",
        marketRegion: "ton",
        venue: "stonfi",
        provider: "synthetic",
        displaySymbol: "TON/USDT",
        providerSymbols: { synthetic: "TON/USDT" },
        quoteCurrency: "USD",
        timezone: "UTC",
        calendarId: "24-7",
      },
      provider: "synthetic",
      interval: "1d",
      generatedAt: new Date().toISOString(),
      tradingDaysPerYear: 365,
      bars: parsed,
    };
  }
  if (!parsed.bars || !parsed.instrument) {
    throw new Error(`Failed to read dataset at ${datasetPath}`);
  }
  const provider =
    parsed.instrument.provider ?? parsed.provider ?? providerForInstrument(parsed.instrument);
  return {
    ...parsed,
    instrument: {
      ...parsed.instrument,
      id: instrumentIdFor({
        assetClass: parsed.instrument.assetClass,
        marketRegion: parsed.instrument.marketRegion,
        venue: parsed.instrument.venue,
        provider,
        displaySymbol: parsed.instrument.displaySymbol,
      }),
      provider,
    },
    provider,
  };
}

export function datasetFileName(
  instrument: Pick<
    InstrumentRefLike,
    "assetClass" | "marketRegion" | "venue" | "provider" | "displaySymbol"
  >,
): string {
  const symbolSlug = instrument.displaySymbol.replace(/[^A-Za-z0-9]+/g, "-");
  return `${[
    instrument.assetClass,
    instrument.marketRegion,
    instrument.venue,
    instrument.provider,
    symbolSlug,
  ].join("-")}.dataset.json`;
}

function dataDomainRoot(outputDir: string): string {
  return dirname(outputDir);
}

function listDatasetPaths(root: string): string[] {
  if (!existsSync(root)) return [];
  const entries = readdirSync(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listDatasetPaths(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".dataset.json")) {
      files.push(entryPath);
    }
  }
  return files;
}

export function listDatasets(outputDir: string): Array<DatasetDocument & { path: string }> {
  return listDatasetPaths(dataDomainRoot(outputDir))
    .map((path) => ({ path, ...readDatasetDocument(path) }))
    .sort((a, b) => statSync(b.path).mtimeMs - statSync(a.path).mtimeMs);
}

export function findLatestDataset(
  outputDir: string,
  predicate: (dataset: DatasetDocument) => boolean,
): (DatasetDocument & { path: string }) | null {
  return listDatasets(outputDir).find((dataset) => predicate(dataset)) ?? null;
}

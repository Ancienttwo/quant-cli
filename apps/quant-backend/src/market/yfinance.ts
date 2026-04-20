import YahooFinance from "yahoo-finance2";
import {
  type YFinanceChartResult,
  YFinanceChartResultSchema,
  YFinanceIntervalSchema,
} from "../types/yfinance";
import { createDatasetDocument, type DatasetDocument, type OhlcvBar } from "./datasets";
import { annualizationBasisForInstrument, type InstrumentRefLike } from "./instruments";

let yahooFinanceClient: InstanceType<typeof YahooFinance> | null = null;

function getYahooFinanceClient(): InstanceType<typeof YahooFinance> {
  if (!yahooFinanceClient) {
    yahooFinanceClient = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  }
  return yahooFinanceClient;
}

function yahooIntervalFor(interval: string): "1d" | "1h" | "15m" {
  return YFinanceIntervalSchema.parse(interval);
}

function periodStart(startDate?: string): Date {
  return startDate
    ? new Date(`${startDate}T00:00:00.000Z`)
    : new Date(Date.now() - 365 * 86400_000);
}

function periodEnd(endDate?: string): Date {
  if (!endDate) {
    return new Date();
  }
  return new Date(new Date(`${endDate}T00:00:00.000Z`).getTime() + 86400_000);
}

function formatBarDate(date: Date, interval: "1d" | "1h" | "15m"): string {
  return interval === "1d"
    ? date.toISOString().slice(0, 10)
    : date.toISOString().slice(0, 16).replace("T", " ");
}

function normalizeQuotesToBars(
  quotes: YFinanceChartResult["quotes"],
  interval: "1d" | "1h" | "15m",
): OhlcvBar[] {
  return quotes
    .filter(
      (quote) =>
        quote.open != null &&
        quote.high != null &&
        quote.low != null &&
        quote.close != null &&
        quote.volume != null &&
        quote.open > 0,
    )
    .map((quote) => {
      const date =
        quote.date instanceof Date
          ? quote.date
          : new Date(typeof quote.date === "number" ? quote.date : quote.date);
      return {
        date: formatBarDate(date, interval),
        open: Number(quote.open?.toFixed(6)),
        high: Number(quote.high?.toFixed(6)),
        low: Number(quote.low?.toFixed(6)),
        close: Number(quote.close?.toFixed(6)),
        volume: Math.round(quote.volume ?? 0),
      };
    });
}

function assertYFinanceInstrumentSupported(instrument: InstrumentRefLike): void {
  if (instrument.assetClass !== "equity") {
    throw new Error(
      `Unsupported provider 'yfinance' for market '${instrument.assetClass}/${instrument.marketRegion}'.`,
    );
  }
}

export function yfinanceSymbolForInstrument(instrument: InstrumentRefLike): string {
  assertYFinanceInstrumentSupported(instrument);
  const explicit = instrument.providerSymbols.yfinance;
  if (explicit) {
    return explicit;
  }
  if (instrument.assetClass === "equity" && instrument.marketRegion === "hk") {
    return /^\d+$/.test(instrument.displaySymbol)
      ? `${instrument.displaySymbol.padStart(4, "0")}.HK`
      : instrument.displaySymbol;
  }
  if (instrument.assetClass === "equity" && instrument.marketRegion === "cn") {
    if (!/^\d{6}$/.test(instrument.displaySymbol)) {
      return instrument.displaySymbol;
    }
    return instrument.venue === "szse"
      ? `${instrument.displaySymbol}.SZ`
      : `${instrument.displaySymbol}.SS`;
  }
  return instrument.displaySymbol;
}

export async function fetchYFinanceChart(
  symbol: string,
  interval: string,
  startDate?: string,
  endDate?: string,
): Promise<YFinanceChartResult> {
  const client = getYahooFinanceClient();
  const result = await client.chart(symbol, {
    period1: periodStart(startDate),
    period2: periodEnd(endDate),
    interval: yahooIntervalFor(interval),
  });
  return YFinanceChartResultSchema.parse(result);
}

export async function fetchYFinanceDatasetDocument(input: {
  instrument: InstrumentRefLike;
  interval: string;
  startDate?: string;
  endDate?: string;
}): Promise<DatasetDocument> {
  const symbol = yfinanceSymbolForInstrument(input.instrument);
  const interval = yahooIntervalFor(input.interval);
  const chart = await fetchYFinanceChart(symbol, interval, input.startDate, input.endDate);
  const bars = normalizeQuotesToBars(chart.quotes, interval);

  if (bars.length === 0) {
    throw new Error(`No Yahoo Finance data for ${symbol}`);
  }

  return {
    ...createDatasetDocument({
      instrument: input.instrument,
      interval,
      bars,
    }),
    tradingDaysPerYear: annualizationBasisForInstrument(input.instrument),
  };
}

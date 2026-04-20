import { QuantBackendError } from "../errors";
import {
  type OpenBBHistoricalBar,
  type OpenBBHistoricalResponse,
  OpenBBHistoricalResponseSchema,
  OpenBBIntervalSchema,
} from "../types/openbb";
import { createDatasetDocument, type DatasetDocument, type OhlcvBar } from "./datasets";
import { annualizationBasisForInstrument, type InstrumentRefLike } from "./instruments";

const OPENBB_ENV = {
  apiUrl: "TONQUANT_OPENBB_API_URL",
  username: "TONQUANT_OPENBB_API_USERNAME",
  password: "TONQUANT_OPENBB_API_PASSWORD",
  credentials: "TONQUANT_OPENBB_CREDENTIALS_JSON",
  sourceProvider: "TONQUANT_OPENBB_SOURCE_PROVIDER",
} as const;

interface OpenBBConfig {
  readonly apiRoot: URL;
  readonly headers: Record<string, string>;
  readonly sourceProvider?: string;
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function compactDetail(input: string): string {
  return input.replace(/\s+/gu, " ").trim().slice(0, 200);
}

function formatBarDate(date: string | Date): string {
  const value = date instanceof Date ? date : new Date(date);
  return value.toISOString().slice(0, 10);
}

function normalizeBars(results: OpenBBHistoricalBar[]): OhlcvBar[] {
  return results.map((bar) => ({
    date: formatBarDate(bar.date),
    open: Number(bar.open.toFixed(6)),
    high: Number(bar.high.toFixed(6)),
    low: Number(bar.low.toFixed(6)),
    close: Number(bar.close.toFixed(6)),
    volume: Math.round(bar.volume ?? 0),
  }));
}

function normalizeApiRoot(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (error) {
    throw new QuantBackendError(
      `Invalid OpenBB API URL in ${OPENBB_ENV.apiUrl}: ${error instanceof Error ? error.message : String(error)}`,
      "QUANT_OPENBB_CONFIG_INVALID",
    );
  }

  const trimmedPath = parsed.pathname.replace(/\/+$/u, "");
  parsed.pathname = trimmedPath.endsWith("/api/v1") ? `${trimmedPath}/` : `${trimmedPath}/api/v1/`;
  return parsed;
}

function loadOpenBBConfig(): OpenBBConfig {
  const rawUrl = process.env[OPENBB_ENV.apiUrl];
  if (!rawUrl) {
    throw new QuantBackendError(
      `OpenBB API URL is not configured. Set ${OPENBB_ENV.apiUrl}.`,
      "QUANT_OPENBB_CONFIG_MISSING",
    );
  }

  const username = process.env[OPENBB_ENV.username];
  const password = process.env[OPENBB_ENV.password];
  if ((username == null) !== (password == null)) {
    throw new QuantBackendError(
      `Set both ${OPENBB_ENV.username} and ${OPENBB_ENV.password}, or neither.`,
      "QUANT_OPENBB_CONFIG_INVALID",
    );
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (username && password) {
    const basicAuth = Buffer.from(`${username}:${password}`, "utf-8").toString("base64");
    headers.Authorization = `Basic ${basicAuth}`;
  }

  const rawCredentials = process.env[OPENBB_ENV.credentials];
  if (rawCredentials) {
    try {
      const parsed = JSON.parse(rawCredentials) as unknown;
      if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Expected a JSON object.");
      }
      headers["X-OpenBB-Credentials"] = JSON.stringify(parsed);
    } catch (error) {
      throw new QuantBackendError(
        `Invalid ${OPENBB_ENV.credentials}: ${error instanceof Error ? error.message : String(error)}`,
        "QUANT_OPENBB_CONFIG_INVALID",
      );
    }
  }

  const sourceProvider = process.env[OPENBB_ENV.sourceProvider]?.trim();
  const apiRoot = normalizeApiRoot(rawUrl);
  const hasCredentialHeaders =
    headers.Authorization != null || headers["X-OpenBB-Credentials"] != null;
  if (
    hasCredentialHeaders &&
    apiRoot.protocol !== "https:" &&
    !isLoopbackHostname(apiRoot.hostname)
  ) {
    throw new QuantBackendError(
      `Refusing to send OpenBB credentials over non-HTTPS transport to ${apiRoot.origin}.`,
      "QUANT_OPENBB_CONFIG_INVALID",
    );
  }

  return {
    apiRoot,
    headers,
    sourceProvider: sourceProvider ? sourceProvider : undefined,
  };
}

function assertOpenBBInstrumentSupported(instrument: InstrumentRefLike): void {
  if (
    instrument.assetClass !== "equity" ||
    (instrument.marketRegion !== "hk" && instrument.marketRegion !== "cn")
  ) {
    throw new QuantBackendError(
      `Unsupported provider 'openbb' for market '${instrument.assetClass}/${instrument.marketRegion}'.`,
      "QUANT_PROVIDER_UNSUPPORTED",
    );
  }
}

export function openbbSymbolForInstrument(instrument: InstrumentRefLike): string {
  assertOpenBBInstrumentSupported(instrument);
  const explicit = instrument.providerSymbols.openbb;
  if (explicit) {
    return explicit;
  }
  if (instrument.marketRegion === "hk") {
    return /^\d+$/u.test(instrument.displaySymbol)
      ? `${instrument.displaySymbol.padStart(4, "0")}.HK`
      : instrument.displaySymbol;
  }
  if (/^\d{6}$/u.test(instrument.displaySymbol)) {
    return instrument.venue === "szse"
      ? `${instrument.displaySymbol}.SZ`
      : `${instrument.displaySymbol}.SS`;
  }
  return instrument.displaySymbol;
}

function assertSupportedInterval(interval: string): "1d" {
  try {
    return OpenBBIntervalSchema.parse(interval);
  } catch {
    throw new QuantBackendError(
      `Unsupported interval '${interval}' for provider 'openbb'.`,
      "QUANT_OPENBB_INTERVAL_UNSUPPORTED",
    );
  }
}

export async function fetchOpenBBHistorical(input: {
  symbol: string;
  interval: string;
  startDate?: string;
  endDate?: string;
}): Promise<OpenBBHistoricalResponse> {
  const interval = assertSupportedInterval(input.interval);
  const config = loadOpenBBConfig();
  const url = new URL("equity/price/historical", config.apiRoot);
  url.searchParams.set("symbol", input.symbol);
  url.searchParams.set("interval", interval);
  if (input.startDate) {
    url.searchParams.set("start_date", input.startDate);
  }
  if (input.endDate) {
    url.searchParams.set("end_date", input.endDate);
  }
  if (config.sourceProvider) {
    url.searchParams.set("provider", config.sourceProvider);
  }

  const response = await fetch(url, {
    headers: config.headers,
  });

  if (!response.ok) {
    const text = await response.text();
    const detail =
      compactDetail(text) || compactDetail(response.statusText) || "Unknown OpenBB error";
    throw new QuantBackendError(
      `OpenBB API request failed (${response.status}): ${detail}`,
      "QUANT_OPENBB_HTTP_ERROR",
    );
  }

  const payload = await response.json();
  return OpenBBHistoricalResponseSchema.parse(payload);
}

export async function fetchOpenBBDatasetDocument(input: {
  instrument: InstrumentRefLike;
  interval: string;
  startDate?: string;
  endDate?: string;
}): Promise<DatasetDocument> {
  const symbol = openbbSymbolForInstrument(input.instrument);
  const historical = await fetchOpenBBHistorical({
    symbol,
    interval: input.interval,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  const bars = normalizeBars(historical.results);

  if (bars.length === 0) {
    throw new QuantBackendError(`No OpenBB data for ${symbol}`, "QUANT_OPENBB_NO_DATA");
  }

  return {
    ...createDatasetDocument({
      instrument: input.instrument,
      interval: "1d",
      bars,
    }),
    tradingDaysPerYear: annualizationBasisForInstrument(input.instrument),
  };
}

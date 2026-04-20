import { z } from "zod";
import { ServiceError } from "../errors.js";
import type {
  MarketCandlesData,
  MarketCompareData,
  MarketInstrumentCandidate,
  MarketProvider,
  MarketQuoteData,
  MarketSearchData,
  MarketTrustMetadata,
} from "../types/market.js";
import {
  MarketCandlesDataSchema,
  MarketCompareDataSchema,
  MarketInstrumentCandidateSchema,
  MarketQuoteDataSchema,
  MarketSearchDataSchema,
} from "../types/market.js";

const OKX_BASE_URL = "https://www.okx.com/api/v5";
const BINANCE_BASE_URL = "https://api.binance.com/api/v3";
const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";

const DISCOVERY_TTL_MS = 5 * 60_000;
const QUOTE_TTL_MS = 30_000;
const CANDLES_TTL_MS = 60_000;

interface CacheEntry<T> {
  readonly data: T;
  readonly timestamp: number;
}

const marketCache = new Map<string, CacheEntry<unknown>>();

const BinanceExchangeInfoSymbolSchema = z.object({
  symbol: z.string(),
  status: z.string(),
  baseAsset: z.string(),
  quoteAsset: z.string(),
  isSpotTradingAllowed: z.boolean().optional(),
});

const BinanceExchangeInfoSchema = z.object({
  symbols: z.array(BinanceExchangeInfoSymbolSchema),
});

const BinanceTicker24hrSchema = z.object({
  symbol: z.string(),
  priceChangePercent: z.string(),
  lastPrice: z.string(),
  quoteVolume: z.string(),
  highPrice: z.string(),
  lowPrice: z.string(),
  closeTime: z.number(),
});

const BinanceKlineSchema = z.tuple([
  z.number(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.number(),
  z.string(),
  z.number(),
  z.string(),
  z.string(),
  z.string(),
]);

const OkxInstrumentSchema = z.object({
  instId: z.string(),
  baseCcy: z.string(),
  quoteCcy: z.string(),
  state: z.string().optional(),
});

const OkxTickerSchema = z.object({
  instId: z.string(),
  last: z.string(),
  open24h: z.string(),
  high24h: z.string(),
  low24h: z.string(),
  volCcy24h: z.string(),
  ts: z.string(),
});

const OkxCandleSchema = z.tuple([
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
]);

const HyperliquidMetaSchema = z.object({
  universe: z.array(
    z.object({
      name: z.string(),
      isDelisted: z.boolean().optional(),
    }),
  ),
});

const HyperliquidAllMidsSchema = z.record(z.string(), z.string());

const HyperliquidCandleSchema = z.object({
  t: z.number(),
  T: z.number(),
  s: z.string(),
  i: z.string(),
  o: z.string(),
  c: z.string(),
  h: z.string(),
  l: z.string(),
  v: z.string(),
  n: z.number().optional(),
});

const HyperliquidCandleSnapshotSchema = z.array(HyperliquidCandleSchema);

function cacheKey(parts: readonly string[]): string {
  return parts.join("|");
}

function isFresh<T>(entry: CacheEntry<T> | undefined, ttlMs: number): entry is CacheEntry<T> {
  return entry != null && Date.now() - entry.timestamp <= ttlMs;
}

async function loadCached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const existing = marketCache.get(key) as CacheEntry<T> | undefined;
  if (isFresh(existing, ttlMs)) {
    return existing.data;
  }
  const data = await loader();
  marketCache.set(key, { data, timestamp: Date.now() });
  return data;
}

async function fetchJson<T>(
  input: string | URL,
  init: RequestInit,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  httpCode: string,
  validationCode: string,
  source: string,
): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new ServiceError(
      `${source} API error: ${response.status} ${response.statusText}`,
      httpCode,
    );
  }

  const json = await response.json();
  try {
    return schema.parse(json);
  } catch (error) {
    throw new ServiceError(
      `${source} payload validation failed: ${error instanceof Error ? error.message : String(error)}`,
      validationCode,
    );
  }
}

function okxEnvelopeSchema<T>(dataSchema: z.ZodType<T, z.ZodTypeDef, unknown>) {
  return z.object({
    code: z.string(),
    msg: z.string().optional().default(""),
    data: dataSchema,
  }) as z.ZodType<{ code: string; msg: string; data: T }, z.ZodTypeDef, unknown>;
}

async function fetchOkxData<T>(
  path: string,
  params: Record<string, string | undefined>,
  dataSchema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<T> {
  const url = new URL(`${OKX_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null) {
      url.searchParams.set(key, value);
    }
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new ServiceError(
      `OKX API error: ${response.status} ${response.statusText}`,
      "OKX_HTTP_ERROR",
    );
  }
  const json = await response.json();
  let payload: { code: string; msg: string; data: T };
  try {
    payload = okxEnvelopeSchema(dataSchema).parse(json);
  } catch (error) {
    throw new ServiceError(
      `OKX payload validation failed: ${error instanceof Error ? error.message : String(error)}`,
      "OKX_PAYLOAD_INVALID",
    );
  }
  if (payload.code !== "0") {
    throw new ServiceError(
      `OKX API error: ${payload.code} ${payload.msg || "Unknown error"}`,
      "OKX_API_ERROR",
    );
  }
  return payload.data;
}

function normalizeSymbol(symbol: string): string {
  return symbol
    .trim()
    .toUpperCase()
    .replace(/[-/]?(USDT|USD)$/u, "");
}

function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(3)}%`;
}

function isoFromMs(value: number): string {
  return new Date(value).toISOString();
}

function ageSeconds(observedAt: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(observedAt).getTime()) / 1000));
}

function withFreshTrustAge<T extends { trust: MarketTrustMetadata }>(data: T): T {
  return {
    ...data,
    trust: {
      ...data.trust,
      age_seconds: ageSeconds(data.trust.observed_at),
    },
  };
}

function intervalMs(interval: string): number {
  const known: Record<string, number> = {
    "15m": 15 * 60_000,
    "1h": 60 * 60_000,
    "4h": 4 * 60 * 60_000,
    "1d": 24 * 60 * 60_000,
  };
  const value = known[interval];
  if (!value) {
    throw new ServiceError(
      `Unsupported interval '${interval}' for market-first public data.`,
      "MARKET_INTERVAL_UNSUPPORTED",
    );
  }
  return value;
}

function trustFor(input: {
  provider: MarketProvider;
  providerSymbol: string;
  quoteCurrency: string;
  marketType: "spot" | "perpetual";
  observedAt: string;
}): MarketTrustMetadata {
  return {
    provider: input.provider,
    venue: input.provider,
    provider_symbol: input.providerSymbol,
    quote_currency: input.quoteCurrency,
    market_type: input.marketType,
    observed_at: input.observedAt,
    age_seconds: ageSeconds(input.observedAt),
  };
}

function okxBar(interval: string): string {
  const known: Record<string, string> = {
    "15m": "15m",
    "1h": "1H",
    "4h": "4H",
    "1d": "1Dutc",
  };
  const value = known[interval];
  if (!value) {
    throw new ServiceError(
      `Unsupported interval '${interval}' for market-first public data.`,
      "MARKET_INTERVAL_UNSUPPORTED",
    );
  }
  return value;
}

function desiredCandleLimit(input: {
  interval: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): number {
  if (input.limit != null) {
    return Math.max(input.limit, 1);
  }
  if (input.startDate || input.endDate) {
    const intervalWindowMs = intervalMs(input.interval);
    const endTime = input.endDate
      ? new Date(`${input.endDate}T23:59:59.999Z`).getTime()
      : Date.now();
    const startTime = input.startDate
      ? new Date(`${input.startDate}T00:00:00.000Z`).getTime()
      : endTime - intervalWindowMs * 30;
    return Math.max(1, Math.ceil((endTime - startTime) / intervalWindowMs) + 1);
  }
  return 100;
}

function completedCandleCloseTime(openTimeMs: number, interval: string): string {
  return new Date(openTimeMs + intervalMs(interval) - 1).toISOString();
}

async function loadOkxUniverse(): Promise<z.infer<typeof OkxInstrumentSchema>[]> {
  const key = cacheKey(["okx", "instruments", "spot", "usdt"]);
  return loadCached(key, DISCOVERY_TTL_MS, async () => {
    const payload = await fetchOkxData(
      "/public/instruments",
      { instType: "SPOT" },
      z.array(OkxInstrumentSchema),
    );
    return payload.filter(
      (instrument) => instrument.quoteCcy === "USDT" && instrument.state !== "suspend",
    );
  });
}

async function resolveOkxCandidate(symbol: string): Promise<MarketInstrumentCandidate> {
  const canonical = normalizeSymbol(symbol);
  const symbols = await loadOkxUniverse();
  const match = symbols.find((entry) => entry.baseCcy === canonical);
  if (!match) {
    throw new ServiceError(`Symbol "${canonical}" not found on OKX.`, "MARKET_SYMBOL_NOT_FOUND");
  }
  return MarketInstrumentCandidateSchema.parse({
    symbol: canonical,
    name: `${match.baseCcy}/${match.quoteCcy}`,
    provider: "okx",
    venue: "okx",
    provider_symbol: match.instId,
    quote_currency: match.quoteCcy,
    market_type: "spot",
  });
}

async function searchOkxCandidates(query: string): Promise<MarketInstrumentCandidate[]> {
  const upper = query.trim().toUpperCase();
  const symbols = await loadOkxUniverse();
  return symbols
    .filter((entry) => entry.baseCcy.includes(upper) || entry.instId.includes(upper))
    .slice(0, 8)
    .map((entry) =>
      MarketInstrumentCandidateSchema.parse({
        symbol: entry.baseCcy,
        name: `${entry.baseCcy}/${entry.quoteCcy}`,
        provider: "okx",
        venue: "okx",
        provider_symbol: entry.instId,
        quote_currency: entry.quoteCcy,
        market_type: "spot",
      }),
    );
}

async function fetchOkxQuote(candidate: MarketInstrumentCandidate): Promise<MarketQuoteData> {
  const key = cacheKey(["quote", "okx", candidate.provider_symbol]);
  return loadCached(key, QUOTE_TTL_MS, async () => {
    const payload = await fetchOkxData(
      "/market/ticker",
      { instId: candidate.provider_symbol },
      z.array(OkxTickerSchema),
    );
    const ticker = payload[0];
    if (!ticker) {
      throw new ServiceError(
        `Symbol "${candidate.symbol}" not found on OKX.`,
        "MARKET_SYMBOL_NOT_FOUND",
      );
    }
    const open24h = Number(ticker.open24h);
    const last = Number(ticker.last);
    const changePct = open24h > 0 ? ((last - open24h) / open24h) * 100 : 0;
    const observedAt = isoFromMs(Number(ticker.ts));
    return MarketQuoteDataSchema.parse({
      symbol: candidate.symbol,
      name: candidate.name,
      price: ticker.last,
      change_24h_pct: formatPercent(changePct),
      volume_24h: ticker.volCcy24h,
      high_24h: ticker.high24h,
      low_24h: ticker.low24h,
      trust: trustFor({
        provider: "okx",
        providerSymbol: ticker.instId,
        quoteCurrency: candidate.quote_currency,
        marketType: "spot",
        observedAt,
      }),
    });
  });
}

async function fetchOkxCandles(
  candidate: MarketInstrumentCandidate,
  input: {
    interval: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  },
): Promise<MarketCandlesData> {
  const requestLimit = Math.min(desiredCandleLimit(input), 300);
  const endTimeMs = input.endDate
    ? new Date(`${input.endDate}T23:59:59.999Z`).getTime()
    : undefined;
  const startTimeMs = input.startDate
    ? new Date(`${input.startDate}T00:00:00.000Z`).getTime()
    : undefined;
  const key = cacheKey([
    "candles",
    "okx",
    candidate.provider_symbol,
    input.interval,
    String(startTimeMs ?? "-"),
    String(endTimeMs ?? "-"),
    String(input.limit ?? requestLimit),
  ]);
  return loadCached(key, CANDLES_TTL_MS, async () => {
    const payload = await fetchOkxData(
      "/market/history-candles",
      {
        instId: candidate.provider_symbol,
        bar: okxBar(input.interval),
        limit: String(requestLimit),
        after: endTimeMs != null ? String(endTimeMs + 1) : undefined,
      },
      z.array(OkxCandleSchema),
    );
    const observedAt = new Date().toISOString();
    const rows = [...payload]
      .map((row) => ({
        openTimeMs: Number(row[0]),
        open: row[1],
        high: row[2],
        low: row[3],
        close: row[4],
        volume: row[7],
      }))
      .filter((row) => Number.isFinite(row.openTimeMs))
      .sort((left, right) => left.openTimeMs - right.openTimeMs)
      .filter((row) => {
        if (startTimeMs != null && row.openTimeMs < startTimeMs) return false;
        if (endTimeMs != null && row.openTimeMs > endTimeMs) return false;
        return true;
      });
    const sliced = input.limit != null ? rows.slice(-input.limit) : rows;
    return MarketCandlesDataSchema.parse({
      symbol: candidate.symbol,
      interval: input.interval,
      candles: sliced.map((row) => ({
        open_time: isoFromMs(row.openTimeMs),
        close_time: completedCandleCloseTime(row.openTimeMs, input.interval),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
      })),
      trust: trustFor({
        provider: "okx",
        providerSymbol: candidate.provider_symbol,
        quoteCurrency: candidate.quote_currency,
        marketType: "spot",
        observedAt,
      }),
    });
  });
}

async function loadBinanceUniverse(): Promise<z.infer<typeof BinanceExchangeInfoSymbolSchema>[]> {
  const key = cacheKey(["binance", "exchangeInfo", "spot", "usdt"]);
  return loadCached(key, DISCOVERY_TTL_MS, async () => {
    const payload = await fetchJson(
      `${BINANCE_BASE_URL}/exchangeInfo`,
      {},
      BinanceExchangeInfoSchema,
      "BINANCE_HTTP_ERROR",
      "BINANCE_PAYLOAD_INVALID",
      "Binance",
    );
    return payload.symbols.filter(
      (symbol) =>
        symbol.status === "TRADING" &&
        symbol.quoteAsset === "USDT" &&
        symbol.isSpotTradingAllowed !== false,
    );
  });
}

async function resolveBinanceCandidate(symbol: string): Promise<MarketInstrumentCandidate> {
  const canonical = normalizeSymbol(symbol);
  const symbols = await loadBinanceUniverse();
  const match = symbols.find((entry) => entry.baseAsset === canonical);
  if (!match) {
    throw new ServiceError(
      `Symbol "${canonical}" not found on Binance.`,
      "MARKET_SYMBOL_NOT_FOUND",
    );
  }
  return MarketInstrumentCandidateSchema.parse({
    symbol: canonical,
    name: `${match.baseAsset}/${match.quoteAsset}`,
    provider: "binance",
    venue: "binance",
    provider_symbol: match.symbol,
    quote_currency: match.quoteAsset,
    market_type: "spot",
  });
}

async function searchBinanceCandidates(query: string): Promise<MarketInstrumentCandidate[]> {
  const upper = query.trim().toUpperCase();
  const symbols = await loadBinanceUniverse();
  return symbols
    .filter((entry) => entry.baseAsset.includes(upper) || entry.symbol.includes(upper))
    .slice(0, 8)
    .map((entry) =>
      MarketInstrumentCandidateSchema.parse({
        symbol: entry.baseAsset,
        name: `${entry.baseAsset}/${entry.quoteAsset}`,
        provider: "binance",
        venue: "binance",
        provider_symbol: entry.symbol,
        quote_currency: entry.quoteAsset,
        market_type: "spot",
      }),
    );
}

async function fetchBinanceQuote(candidate: MarketInstrumentCandidate): Promise<MarketQuoteData> {
  const key = cacheKey(["quote", "binance", candidate.provider_symbol]);
  return loadCached(key, QUOTE_TTL_MS, async () => {
    const payload = await fetchJson(
      `${BINANCE_BASE_URL}/ticker/24hr?symbol=${candidate.provider_symbol}`,
      {},
      BinanceTicker24hrSchema,
      "BINANCE_HTTP_ERROR",
      "BINANCE_PAYLOAD_INVALID",
      "Binance",
    );
    const observedAt = isoFromMs(payload.closeTime);
    return MarketQuoteDataSchema.parse({
      symbol: candidate.symbol,
      name: candidate.name,
      price: payload.lastPrice,
      change_24h_pct: formatPercent(Number(payload.priceChangePercent)),
      volume_24h: payload.quoteVolume,
      high_24h: payload.highPrice,
      low_24h: payload.lowPrice,
      trust: trustFor({
        provider: "binance",
        providerSymbol: payload.symbol,
        quoteCurrency: candidate.quote_currency,
        marketType: "spot",
        observedAt,
      }),
    });
  });
}

async function fetchBinanceCandles(
  candidate: MarketInstrumentCandidate,
  input: {
    interval: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  },
): Promise<MarketCandlesData> {
  const params = new URLSearchParams({
    symbol: candidate.provider_symbol,
    interval: input.interval,
  });
  if (input.limit != null) {
    params.set("limit", String(input.limit));
  }
  if (input.startDate) {
    params.set("startTime", String(new Date(`${input.startDate}T00:00:00.000Z`).getTime()));
  }
  if (input.endDate) {
    params.set("endTime", String(new Date(`${input.endDate}T23:59:59.999Z`).getTime()));
  }
  const key = cacheKey([
    "candles",
    "binance",
    candidate.provider_symbol,
    input.interval,
    input.startDate ?? "-",
    input.endDate ?? "-",
    String(input.limit ?? "-"),
  ]);
  return loadCached(key, CANDLES_TTL_MS, async () => {
    const payload = await fetchJson(
      `${BINANCE_BASE_URL}/klines?${params.toString()}`,
      {},
      z.array(BinanceKlineSchema),
      "BINANCE_HTTP_ERROR",
      "BINANCE_PAYLOAD_INVALID",
      "Binance",
    );
    const observedAt = new Date().toISOString();
    const rows = input.limit != null ? payload.slice(-input.limit) : payload;
    return MarketCandlesDataSchema.parse({
      symbol: candidate.symbol,
      interval: input.interval,
      candles: rows.map((kline) => ({
        open_time: isoFromMs(kline[0]),
        close_time: isoFromMs(kline[6]),
        open: kline[1],
        high: kline[2],
        low: kline[3],
        close: kline[4],
        volume: kline[7],
        trades: kline[8],
      })),
      trust: trustFor({
        provider: "binance",
        providerSymbol: candidate.provider_symbol,
        quoteCurrency: candidate.quote_currency,
        marketType: "spot",
        observedAt,
      }),
    });
  });
}

async function loadHyperliquidUniverse(): Promise<
  z.infer<typeof HyperliquidMetaSchema>["universe"]
> {
  const key = cacheKey(["hyperliquid", "meta", "perps"]);
  return loadCached(key, DISCOVERY_TTL_MS, async () => {
    const payload = await fetchJson(
      HYPERLIQUID_INFO_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "meta" }),
      },
      HyperliquidMetaSchema,
      "HYPERLIQUID_HTTP_ERROR",
      "HYPERLIQUID_PAYLOAD_INVALID",
      "Hyperliquid",
    );
    return payload.universe.filter((entry) => entry.isDelisted !== true);
  });
}

async function resolveHyperliquidCandidate(symbol: string): Promise<MarketInstrumentCandidate> {
  const canonical = normalizeSymbol(symbol);
  const universe = await loadHyperliquidUniverse();
  const match = universe.find((entry) => entry.name === canonical);
  if (!match) {
    throw new ServiceError(
      `Symbol "${canonical}" not found on Hyperliquid.`,
      "MARKET_SYMBOL_NOT_FOUND",
    );
  }
  return MarketInstrumentCandidateSchema.parse({
    symbol: canonical,
    name: `${match.name} perpetual`,
    provider: "hyperliquid",
    venue: "hyperliquid",
    provider_symbol: match.name,
    quote_currency: "USD",
    market_type: "perpetual",
  });
}

async function searchHyperliquidCandidates(query: string): Promise<MarketInstrumentCandidate[]> {
  const upper = query.trim().toUpperCase();
  const universe = await loadHyperliquidUniverse();
  return universe
    .filter((entry) => entry.name.includes(upper))
    .slice(0, 8)
    .map((entry) =>
      MarketInstrumentCandidateSchema.parse({
        symbol: entry.name,
        name: `${entry.name} perpetual`,
        provider: "hyperliquid",
        venue: "hyperliquid",
        provider_symbol: entry.name,
        quote_currency: "USD",
        market_type: "perpetual",
      }),
    );
}

async function fetchHyperliquidAllMids(): Promise<Record<string, string>> {
  const key = cacheKey(["hyperliquid", "allMids"]);
  return loadCached(key, QUOTE_TTL_MS, async () =>
    fetchJson(
      HYPERLIQUID_INFO_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "allMids" }),
      },
      HyperliquidAllMidsSchema,
      "HYPERLIQUID_HTTP_ERROR",
      "HYPERLIQUID_PAYLOAD_INVALID",
      "Hyperliquid",
    ),
  );
}

async function fetchHyperliquidRawCandles(input: {
  symbol: string;
  interval: string;
  startTime: number;
  endTime: number;
}): Promise<z.infer<typeof HyperliquidCandleSnapshotSchema>> {
  return fetchJson(
    HYPERLIQUID_INFO_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "candleSnapshot",
        req: {
          coin: input.symbol,
          interval: input.interval,
          startTime: input.startTime,
          endTime: input.endTime,
        },
      }),
    },
    HyperliquidCandleSnapshotSchema,
    "HYPERLIQUID_HTTP_ERROR",
    "HYPERLIQUID_PAYLOAD_INVALID",
    "Hyperliquid",
  );
}

async function fetchHyperliquidQuote(
  candidate: MarketInstrumentCandidate,
): Promise<MarketQuoteData> {
  const key = cacheKey(["quote", "hyperliquid", candidate.provider_symbol]);
  return loadCached(key, QUOTE_TTL_MS, async () => {
    const mids = await fetchHyperliquidAllMids();
    const price = mids[candidate.provider_symbol];
    if (!price) {
      throw new ServiceError(
        `Symbol "${candidate.symbol}" not found on Hyperliquid.`,
        "MARKET_SYMBOL_NOT_FOUND",
      );
    }

    const now = Date.now();
    const candles = await fetchHyperliquidRawCandles({
      symbol: candidate.provider_symbol,
      interval: "1d",
      startTime: now - 3 * 24 * 60 * 60_000,
      endTime: now,
    });
    const latest = candles[candles.length - 1];
    const previous = candles[candles.length - 2];
    if (!latest) {
      throw new ServiceError(
        `No Hyperliquid candles available for "${candidate.symbol}".`,
        "MARKET_CANDLES_NOT_FOUND",
      );
    }
    const currentPrice = Number(price);
    const reference = previous ? Number(previous.c) : Number(latest.o);
    const changePct = reference > 0 ? ((currentPrice - reference) / reference) * 100 : 0;
    const observedAt = new Date().toISOString();

    return MarketQuoteDataSchema.parse({
      symbol: candidate.symbol,
      name: candidate.name,
      price,
      change_24h_pct: formatPercent(changePct),
      volume_24h: latest.v,
      high_24h: latest.h,
      low_24h: latest.l,
      trust: trustFor({
        provider: "hyperliquid",
        providerSymbol: candidate.provider_symbol,
        quoteCurrency: candidate.quote_currency,
        marketType: "perpetual",
        observedAt,
      }),
    });
  });
}

async function fetchHyperliquidCandles(
  candidate: MarketInstrumentCandidate,
  input: {
    interval: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  },
): Promise<MarketCandlesData> {
  const endTime = input.endDate ? new Date(`${input.endDate}T23:59:59.999Z`).getTime() : Date.now();
  const startTime = input.startDate
    ? new Date(`${input.startDate}T00:00:00.000Z`).getTime()
    : endTime - intervalMs(input.interval) * Math.max(input.limit ?? 30, 1);
  const key = cacheKey([
    "candles",
    "hyperliquid",
    candidate.provider_symbol,
    input.interval,
    String(startTime),
    String(endTime),
  ]);
  return loadCached(key, CANDLES_TTL_MS, async () => {
    const payload = await fetchHyperliquidRawCandles({
      symbol: candidate.provider_symbol,
      interval: input.interval,
      startTime,
      endTime,
    });
    const observedAt = new Date().toISOString();
    const rows = input.limit != null ? payload.slice(-input.limit) : payload;
    return MarketCandlesDataSchema.parse({
      symbol: candidate.symbol,
      interval: input.interval,
      candles: rows.map((candle) => ({
        open_time: isoFromMs(candle.t),
        close_time: isoFromMs(candle.T),
        open: candle.o,
        high: candle.h,
        low: candle.l,
        close: candle.c,
        volume: candle.v,
        trades: candle.n,
      })),
      trust: trustFor({
        provider: "hyperliquid",
        providerSymbol: candidate.provider_symbol,
        quoteCurrency: candidate.quote_currency,
        marketType: "perpetual",
        observedAt,
      }),
    });
  });
}

async function resolveCandidate(
  symbol: string,
  provider: MarketProvider,
): Promise<MarketInstrumentCandidate> {
  if (provider === "okx") {
    return resolveOkxCandidate(symbol);
  }
  return provider === "binance"
    ? resolveBinanceCandidate(symbol)
    : resolveHyperliquidCandidate(symbol);
}

export async function fetchMarketQuoteData(
  symbol: string,
  provider: MarketProvider = "okx",
): Promise<MarketQuoteData> {
  const candidate = await resolveCandidate(symbol, provider);
  const quote =
    provider === "okx"
      ? await fetchOkxQuote(candidate)
      : provider === "binance"
        ? await fetchBinanceQuote(candidate)
        : await fetchHyperliquidQuote(candidate);
  return withFreshTrustAge(quote);
}

export async function fetchMarketCandlesData(
  symbol: string,
  input: {
    provider?: MarketProvider;
    interval?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  } = {},
): Promise<MarketCandlesData> {
  const provider = input.provider ?? "okx";
  const interval = input.interval ?? "1d";
  const candidate = await resolveCandidate(symbol, provider);
  const candles =
    provider === "okx"
      ? await fetchOkxCandles(candidate, {
          interval,
          startDate: input.startDate,
          endDate: input.endDate,
          limit: input.limit,
        })
      : provider === "binance"
        ? await fetchBinanceCandles(candidate, {
            interval,
            startDate: input.startDate,
            endDate: input.endDate,
            limit: input.limit,
          })
        : await fetchHyperliquidCandles(candidate, {
            interval,
            startDate: input.startDate,
            endDate: input.endDate,
            limit: input.limit,
          });
  return withFreshTrustAge(candles);
}

export async function fetchMarketSearchData(
  query: string,
  provider?: MarketProvider,
): Promise<MarketSearchData> {
  const candidates =
    provider === "okx"
      ? await searchOkxCandidates(query)
      : provider === "binance"
        ? await searchBinanceCandidates(query)
        : provider === "hyperliquid"
          ? await searchHyperliquidCandidates(query)
          : [
              ...(await searchOkxCandidates(query)),
              ...(await searchBinanceCandidates(query)),
              ...(await searchHyperliquidCandidates(query)),
            ];
  return MarketSearchDataSchema.parse({
    query,
    candidates,
  });
}

export async function fetchMarketCompareData(symbol: string): Promise<MarketCompareData> {
  const providerOrder: MarketProvider[] = ["okx", "binance", "hyperliquid"];
  const settled = await Promise.allSettled(
    providerOrder.map(async (provider) => ({
      provider,
      quote: await fetchMarketQuoteData(symbol, provider),
    })),
  );
  const okxEntry = settled[0];
  if (!okxEntry || okxEntry.status !== "fulfilled") {
    throw new ServiceError(
      `Could not compare "${normalizeSymbol(symbol)}". OKX is required as the primary provider and did not return a quote.`,
      "MARKET_COMPARE_OKX_REQUIRED",
    );
  }
  const quotes = settled
    .filter(
      (
        result,
      ): result is PromiseFulfilledResult<{
        provider: MarketProvider;
        quote: MarketQuoteData;
      }> => result.status === "fulfilled",
    )
    .map((result) => result.value.quote);
  if (quotes.length < 2) {
    const details = settled
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) =>
        result.reason instanceof Error ? result.reason.message : String(result.reason),
      );
    throw new ServiceError(
      `Could not compare "${normalizeSymbol(symbol)}" across providers. OKX resolved, but fewer than 2 providers returned quotes.${details.length > 0 ? ` Secondary failures: ${details.join(" | ")}` : ""}`,
      "MARKET_COMPARE_INSUFFICIENT_PROVIDERS",
    );
  }
  const prices = quotes.map((quote) => Number(quote.price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const spreadAbs = max - min;
  const spreadPct = min > 0 ? (spreadAbs / min) * 100 : 0;
  return MarketCompareDataSchema.parse({
    symbol: normalizeSymbol(symbol),
    quotes,
    spread_abs: spreadAbs.toFixed(6),
    spread_pct: formatPercent(spreadPct),
  });
}

export function clearMarketCache(): void {
  marketCache.clear();
}

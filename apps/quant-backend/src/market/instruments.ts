import { QuantBackendError } from "../errors";
import { providerCompatibilityError } from "./provider-compatibility";

export type AssetClass = "crypto" | "equity" | "bond";
export type MarketRegion = "ton" | "global" | "us" | "hk" | "cn";
export type VenueCode =
  | "stonfi"
  | "okx"
  | "binance"
  | "hyperliquid"
  | "nyse"
  | "nasdaq"
  | "hkex"
  | "sse"
  | "szse"
  | "cibm";
export type ProviderCode =
  | "synthetic"
  | "stonfi"
  | "tonapi"
  | "okx"
  | "binance"
  | "hyperliquid"
  | "yfinance"
  | "openbb";
export type CalendarId = "24-7" | "XNYS" | "XNAS" | "XHKG" | "XSHG" | "XSHE" | "CIBM";

export interface InstrumentRefLike {
  id: string;
  assetClass: AssetClass;
  marketRegion: MarketRegion;
  venue: VenueCode;
  provider: ProviderCode;
  displaySymbol: string;
  providerSymbols: Partial<Record<ProviderCode, string>>;
  quoteCurrency: string;
  timezone: string;
  calendarId: CalendarId;
}

interface MarketDefaults {
  quoteCurrency: string;
  timezone: string;
  calendarId: CalendarId;
  defaultVenue: VenueCode;
  defaultProvider: ProviderCode;
}

function assertProviderAllowed(
  assetClass: AssetClass,
  marketRegion: MarketRegion,
  provider: ProviderCode,
): void {
  const message = providerCompatibilityError({ assetClass, marketRegion, provider });
  if (message) {
    throw new QuantBackendError(message, "QUANT_PROVIDER_UNSUPPORTED");
  }
}

function marketDefaultsFor(
  assetClass: AssetClass,
  marketRegion: MarketRegion,
): MarketDefaults | undefined {
  if (assetClass === "crypto" && marketRegion === "ton") {
    return {
      quoteCurrency: "USD",
      timezone: "UTC",
      calendarId: "24-7",
      defaultVenue: "stonfi",
      defaultProvider: "stonfi",
    };
  }
  if (assetClass === "crypto" && marketRegion === "global") {
    return {
      quoteCurrency: "USDT",
      timezone: "UTC",
      calendarId: "24-7",
      defaultVenue: "okx",
      defaultProvider: "okx",
    };
  }
  if (assetClass === "equity" && marketRegion === "us") {
    return {
      quoteCurrency: "USD",
      timezone: "America/New_York",
      calendarId: "XNYS",
      defaultVenue: "nyse",
      defaultProvider: "yfinance",
    };
  }
  if (assetClass === "equity" && marketRegion === "hk") {
    return {
      quoteCurrency: "HKD",
      timezone: "Asia/Hong_Kong",
      calendarId: "XHKG",
      defaultVenue: "hkex",
      defaultProvider: "yfinance",
    };
  }
  if (assetClass === "equity" && marketRegion === "cn") {
    return {
      quoteCurrency: "CNY",
      timezone: "Asia/Shanghai",
      calendarId: "XSHG",
      defaultVenue: "sse",
      defaultProvider: "yfinance",
    };
  }
  if (assetClass === "bond" && marketRegion === "cn") {
    return {
      quoteCurrency: "CNY",
      timezone: "Asia/Shanghai",
      calendarId: "CIBM",
      defaultVenue: "cibm",
      defaultProvider: "synthetic",
    };
  }
  return undefined;
}

function assertVenueAllowed(
  assetClass: AssetClass,
  marketRegion: MarketRegion,
  venue: VenueCode,
): void {
  if (assetClass === "crypto" && !(marketRegion === "ton" && venue === "stonfi")) {
    if (
      marketRegion === "global" &&
      (venue === "okx" || venue === "binance" || venue === "hyperliquid")
    ) {
      return;
    }
    throw new QuantBackendError(
      `Unsupported crypto venue '${venue}' for market '${marketRegion}'.`,
      "QUANT_MARKET_COMBINATION_UNSUPPORTED",
    );
  }
  if (
    assetClass === "equity" &&
    !(
      (marketRegion === "us" && (venue === "nyse" || venue === "nasdaq")) ||
      (marketRegion === "hk" && venue === "hkex") ||
      (marketRegion === "cn" && (venue === "sse" || venue === "szse"))
    )
  ) {
    throw new QuantBackendError(
      `Unsupported equity venue '${venue}' for market '${marketRegion}'.`,
      "QUANT_MARKET_COMBINATION_UNSUPPORTED",
    );
  }
  if (assetClass === "bond" && !(marketRegion === "cn" && venue === "cibm")) {
    throw new QuantBackendError(
      `Unsupported bond venue '${venue}' for market '${marketRegion}'.`,
      "QUANT_MARKET_COMBINATION_UNSUPPORTED",
    );
  }
}

function normalizeSymbolForProvider(
  symbol: string,
  assetClass: AssetClass,
  marketRegion: MarketRegion,
  venue: VenueCode,
  provider: ProviderCode,
): string {
  const trimmed = symbol.trim().toUpperCase();
  if (provider === "synthetic") return trimmed;
  if (assetClass === "crypto" && marketRegion === "ton") {
    return trimmed;
  }
  if (assetClass === "crypto" && marketRegion === "global") {
    const base = trimmed.replace(/[-/]?(USDT|USD)$/u, "");
    if (provider === "binance") return `${base}USDT`;
    if (provider === "okx") return `${base}-USDT`;
    return base;
  }
  if (assetClass === "equity" && marketRegion === "hk") {
    return /^\d+$/.test(trimmed) ? `${trimmed.padStart(4, "0")}.HK` : trimmed;
  }
  if (assetClass === "equity" && marketRegion === "cn" && /^\d{6}$/.test(trimmed)) {
    return venue === "sse" ? `${trimmed}.SS` : `${trimmed}.SZ`;
  }
  return trimmed;
}

function normalizeDisplaySymbol(
  symbol: string,
  assetClass: AssetClass,
  marketRegion: MarketRegion,
): string {
  const trimmed = symbol.trim().toUpperCase();
  if (assetClass === "crypto" && marketRegion === "global") {
    return trimmed.replace(/[-/]?(USDT|USD)$/u, "");
  }
  return trimmed;
}

function defaultVenueFor(
  assetClass: AssetClass,
  marketRegion: MarketRegion,
  provider: ProviderCode,
): VenueCode {
  if (assetClass === "crypto" && marketRegion === "global") {
    if (provider === "hyperliquid") return "hyperliquid";
    if (provider === "binance") return "binance";
    return "okx";
  }
  const defaults = marketDefaultsFor(assetClass, marketRegion);
  if (!defaults) {
    throw new QuantBackendError(
      `Unsupported market combination: ${assetClass}/${marketRegion}`,
      "QUANT_MARKET_COMBINATION_UNSUPPORTED",
    );
  }
  return defaults.defaultVenue;
}

function quoteCurrencyFor(
  defaults: MarketDefaults,
  assetClass: AssetClass,
  marketRegion: MarketRegion,
  provider: ProviderCode,
): string {
  if (assetClass === "crypto" && marketRegion === "global") {
    return provider === "hyperliquid" ? "USD" : "USDT";
  }
  return defaults.quoteCurrency;
}

export function instrumentIdFor(input: {
  assetClass: AssetClass;
  marketRegion: MarketRegion;
  venue: VenueCode;
  provider: ProviderCode;
  displaySymbol: string;
}): string {
  return [
    input.assetClass,
    input.marketRegion,
    input.venue,
    input.provider,
    input.displaySymbol.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  ].join(":");
}

export function resolveInstrument(input: {
  symbol: string;
  assetClass: AssetClass;
  marketRegion: MarketRegion;
  venue?: VenueCode;
  provider?: ProviderCode;
}): InstrumentRefLike {
  const defaults = marketDefaultsFor(input.assetClass, input.marketRegion);
  if (!defaults) {
    throw new QuantBackendError(
      `Unsupported market combination: ${input.assetClass}/${input.marketRegion}`,
      "QUANT_MARKET_COMBINATION_UNSUPPORTED",
    );
  }
  const provider = input.provider ?? defaults.defaultProvider;
  const venue = input.venue ?? defaultVenueFor(input.assetClass, input.marketRegion, provider);
  assertVenueAllowed(input.assetClass, input.marketRegion, venue);
  assertProviderAllowed(input.assetClass, input.marketRegion, provider);
  const displaySymbol = normalizeDisplaySymbol(input.symbol, input.assetClass, input.marketRegion);

  return {
    id: instrumentIdFor({
      assetClass: input.assetClass,
      marketRegion: input.marketRegion,
      venue,
      provider,
      displaySymbol,
    }),
    assetClass: input.assetClass,
    marketRegion: input.marketRegion,
    venue,
    provider,
    displaySymbol,
    providerSymbols: {
      synthetic: normalizeSymbolForProvider(
        displaySymbol,
        input.assetClass,
        input.marketRegion,
        venue,
        "synthetic",
      ),
      [provider]: normalizeSymbolForProvider(
        displaySymbol,
        input.assetClass,
        input.marketRegion,
        venue,
        provider,
      ),
    },
    quoteCurrency: quoteCurrencyFor(defaults, input.assetClass, input.marketRegion, provider),
    timezone: defaults.timezone,
    calendarId: defaults.calendarId,
  };
}

export function resolveInstrumentsFromInput(input: Record<string, unknown>): InstrumentRefLike[] {
  const supplied = input.instruments as InstrumentRefLike[] | undefined;
  if (supplied && supplied.length > 0) {
    return supplied.map((instrument) =>
      resolveInstrument({
        symbol: instrument.displaySymbol,
        assetClass: instrument.assetClass,
        marketRegion: instrument.marketRegion,
        venue: instrument.venue,
        provider: (input.provider as ProviderCode | undefined) ?? instrument.provider,
      }),
    );
  }

  const symbols = ((input.symbols as string[] | undefined) ?? []).map((symbol) =>
    symbol.trim().toUpperCase(),
  );
  const assetClass = (input.assetClass as AssetClass | undefined) ?? "crypto";
  const marketRegion = (input.marketRegion as MarketRegion | undefined) ?? "ton";
  const venue = input.venue as VenueCode | undefined;
  const provider = input.provider as ProviderCode | undefined;

  if (symbols.length === 0) {
    throw new QuantBackendError("Expected symbols or instruments.", "QUANT_REQUEST_INVALID");
  }

  return symbols.map((symbol) =>
    resolveInstrument({
      symbol,
      assetClass,
      marketRegion,
      venue,
      provider,
    }),
  );
}

export function providerForInstrument(instrument: InstrumentRefLike): ProviderCode {
  if (instrument.provider) {
    return instrument.provider;
  }
  if (instrument.assetClass === "crypto" && instrument.marketRegion === "ton") {
    return "synthetic";
  }
  if (
    instrument.assetClass === "equity" &&
    (instrument.marketRegion === "us" ||
      instrument.marketRegion === "hk" ||
      instrument.marketRegion === "cn")
  ) {
    return "synthetic";
  }
  throw new Error(
    `Provider stub only: no market-data provider implemented for ${instrument.assetClass}/${instrument.marketRegion}/${instrument.venue}.`,
  );
}

export function annualizationBasisForInstrument(instrument: InstrumentRefLike): number {
  return instrument.calendarId === "24-7" ? 365 : 252;
}

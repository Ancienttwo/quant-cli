import type {
  AssetClass,
  InstrumentRef,
  MarketRegion,
  ProviderCode,
  VenueCode,
} from "../types/base.js";
import { defaultProviderFor, resolveInstruments } from "./resolver.js";

export type InstrumentSelectionRequest = {
  readonly assetClass?: AssetClass;
  readonly marketRegion?: MarketRegion;
  readonly venue?: VenueCode;
  readonly provider?: ProviderCode;
  readonly symbols?: readonly string[];
  readonly instruments?: readonly InstrumentRef[];
};

export type InstrumentSelectionResult = InstrumentSelectionRequest & {
  readonly assetClass: AssetClass;
  readonly marketRegion: MarketRegion;
  readonly venue?: VenueCode;
  readonly provider: ProviderCode;
  readonly symbols: readonly string[];
  readonly instruments: readonly InstrumentRef[];
};

export function resolveInstrumentSelection<T extends InstrumentSelectionRequest>(
  request: T,
): T & InstrumentSelectionResult {
  const assetClass = request.assetClass ?? "crypto";
  const marketRegion = request.marketRegion ?? "ton";
  const provider = request.provider ?? defaultProviderFor(assetClass, marketRegion);
  const hasInstruments = (request.instruments?.length ?? 0) > 0;
  const hasSymbols = (request.symbols?.length ?? 0) > 0;
  const instruments = hasInstruments
    ? (request.instruments ?? []).map((instrument) => {
        const [resolved] = resolveInstruments({
          symbols: [instrument.displaySymbol],
          assetClass: instrument.assetClass,
          marketRegion: instrument.marketRegion,
          venue: instrument.venue,
          provider: request.provider ?? instrument.provider,
        });
        if (!resolved) {
          throw new Error(`Expected instrument resolution for '${instrument.displaySymbol}'.`);
        }
        return resolved;
      })
    : hasSymbols
      ? resolveInstruments({
          symbols: request.symbols ?? [],
          assetClass,
          marketRegion,
          venue: request.venue,
          provider,
        })
      : [];
  const symbols = hasSymbols
    ? [...(request.symbols ?? [])]
    : instruments.map((instrument) => instrument.displaySymbol);
  const venue = request.venue ?? instruments[0]?.venue;

  return {
    ...request,
    assetClass,
    marketRegion,
    venue,
    provider,
    symbols,
    instruments,
  };
}

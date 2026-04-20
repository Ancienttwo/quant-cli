import { z } from "zod";

export const MarketProviderSchema = z.enum(["okx", "binance", "hyperliquid"]);
export type MarketProvider = z.infer<typeof MarketProviderSchema>;

export const MarketVenueSchema = z.enum(["okx", "binance", "hyperliquid"]);
export type MarketVenue = z.infer<typeof MarketVenueSchema>;

export const MarketTypeSchema = z.enum(["spot", "perpetual"]);
export type MarketType = z.infer<typeof MarketTypeSchema>;

export const MarketTrustMetadataSchema = z.object({
  provider: MarketProviderSchema,
  venue: MarketVenueSchema,
  provider_symbol: z.string().min(1),
  quote_currency: z.string().min(1),
  market_type: MarketTypeSchema,
  observed_at: z.string().datetime(),
  age_seconds: z.number().nonnegative(),
});
export type MarketTrustMetadata = z.infer<typeof MarketTrustMetadataSchema>;

export const MarketInstrumentCandidateSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().min(1),
  provider: MarketProviderSchema,
  venue: MarketVenueSchema,
  provider_symbol: z.string().min(1),
  quote_currency: z.string().min(1),
  market_type: MarketTypeSchema,
});
export type MarketInstrumentCandidate = z.infer<typeof MarketInstrumentCandidateSchema>;

export const MarketQuoteDataSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().min(1),
  price: z.string().min(1),
  change_24h_pct: z.string().min(1),
  volume_24h: z.string().min(1),
  high_24h: z.string().optional(),
  low_24h: z.string().optional(),
  trust: MarketTrustMetadataSchema,
});
export type MarketQuoteData = z.infer<typeof MarketQuoteDataSchema>;

export const MarketSearchDataSchema = z.object({
  query: z.string().min(1),
  candidates: z.array(MarketInstrumentCandidateSchema),
});
export type MarketSearchData = z.infer<typeof MarketSearchDataSchema>;

export const MarketCompareDataSchema = z.object({
  symbol: z.string().min(1),
  quotes: z.array(MarketQuoteDataSchema).min(2),
  spread_abs: z.string().min(1),
  spread_pct: z.string().min(1),
});
export type MarketCompareData = z.infer<typeof MarketCompareDataSchema>;

export const MarketCandleSchema = z.object({
  open_time: z.string().datetime(),
  close_time: z.string().datetime(),
  open: z.string().min(1),
  high: z.string().min(1),
  low: z.string().min(1),
  close: z.string().min(1),
  volume: z.string().min(1),
  trades: z.number().int().nonnegative().optional(),
});
export type MarketCandle = z.infer<typeof MarketCandleSchema>;

export const MarketCandlesDataSchema = z.object({
  symbol: z.string().min(1),
  interval: z.string().min(1),
  candles: z.array(MarketCandleSchema),
  trust: MarketTrustMetadataSchema,
});
export type MarketCandlesData = z.infer<typeof MarketCandlesDataSchema>;

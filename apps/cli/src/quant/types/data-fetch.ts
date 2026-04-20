import { z } from "zod";
import {
  AssetClassSchema,
  DateStringSchema,
  InstrumentRefSchema,
  MarketRegionSchema,
  ProviderCodeSchema,
  QuantRunMetaSchema,
  VenueCodeSchema,
} from "./base.js";

export const DatasetIntervalSchema = z.enum(["1d", "1h", "15m"]);
export type DatasetInterval = z.infer<typeof DatasetIntervalSchema>;

export const DataFetchRequestSchema = z
  .object({
    assetClass: AssetClassSchema.default("crypto"),
    marketRegion: MarketRegionSchema.default("ton"),
    venue: VenueCodeSchema.optional(),
    provider: ProviderCodeSchema.optional(),
    symbols: z.array(z.string().min(1)).optional(),
    instruments: z.array(InstrumentRefSchema).optional(),
    interval: DatasetIntervalSchema.default("1d"),
    startDate: DateStringSchema.optional(),
    endDate: DateStringSchema.optional(),
    outputDir: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.symbols?.length ?? 0) === 0 && (value.instruments?.length ?? 0) === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expected symbols or instruments.",
        path: ["symbols"],
      });
    }
  });
export type DataFetchRequest = z.input<typeof DataFetchRequestSchema>;

export const DataFetchDateRangeSchema = z.object({
  start: DateStringSchema,
  end: DateStringSchema,
});
export type DataFetchDateRange = z.infer<typeof DataFetchDateRangeSchema>;

export const FetchedDatasetSummarySchema = z.object({
  symbol: z.string().min(1),
  instrument: InstrumentRefSchema,
  interval: DatasetIntervalSchema,
  path: z.string().min(1),
  barCount: z.number().int().nonnegative(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type FetchedDatasetSummary = z.infer<typeof FetchedDatasetSummarySchema>;

export const DataFetchResultSchema = QuantRunMetaSchema.extend({
  instruments: z.array(InstrumentRefSchema).default([]),
  datasets: z.array(FetchedDatasetSummarySchema).default([]),
  fetchedSymbols: z.array(z.string()).default([]),
  cacheHits: z.number().int().nonnegative().default(0),
  cacheMisses: z.number().int().nonnegative().default(0),
  barCount: z.number().int().nonnegative(),
  cacheFiles: z.array(z.string()).default([]),
  interval: DatasetIntervalSchema.default("1d"),
  symbolCount: z.number().int().nonnegative().optional(),
  dateRange: DataFetchDateRangeSchema.optional(),
});
export type DataFetchResult = z.infer<typeof DataFetchResultSchema>;

export const DataListRequestSchema = z.object({
  outputDir: z.string().min(1).optional(),
});
export type DataListRequest = z.input<typeof DataListRequestSchema>;

export const CachedDatasetSummarySchema = z.object({
  symbol: z.string().min(1),
  instrument: InstrumentRefSchema,
  interval: DatasetIntervalSchema,
  path: z.string().min(1),
  barCount: z.number().int().nonnegative(),
  startDate: DateStringSchema.optional(),
  endDate: DateStringSchema.optional(),
});
export type CachedDatasetSummary = z.infer<typeof CachedDatasetSummarySchema>;

export const DataListResultSchema = QuantRunMetaSchema.extend({
  datasets: z.array(CachedDatasetSummarySchema).default([]),
});
export type DataListResult = z.infer<typeof DataListResultSchema>;

export const DataInfoRequestSchema = z.object({
  symbol: z.string().min(1),
  assetClass: AssetClassSchema.default("crypto"),
  marketRegion: MarketRegionSchema.default("ton"),
  venue: VenueCodeSchema.optional(),
  provider: ProviderCodeSchema.optional(),
  interval: DatasetIntervalSchema.default("1d"),
  outputDir: z.string().min(1).optional(),
});
export type DataInfoRequest = z.input<typeof DataInfoRequestSchema>;

export const DataInfoResultSchema = QuantRunMetaSchema.extend({
  dataset: CachedDatasetSummarySchema,
});
export type DataInfoResult = z.infer<typeof DataInfoResultSchema>;

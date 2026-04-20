import { z } from "zod";
import {
  AssetClassSchema,
  DataModeSchema,
  DateStringSchema,
  InstrumentRefSchema,
  MarketRegionSchema,
  ProviderCodeSchema,
  QuantParamValueSchema,
  QuantRunMetaSchema,
  VenueCodeSchema,
} from "./base.js";

export const SlippageConfigSchema = z.object({
  model: z.enum(["fixed_tick", "percentage"]).default("percentage"),
  value: z.number().nonnegative().default(0),
});
export type SlippageConfig = z.infer<typeof SlippageConfigSchema>;

export const BacktestCostConfigSchema = z.object({
  slippage: SlippageConfigSchema.optional(),
  borrowRateAnnual: z.number().nonnegative().default(0),
});
export type BacktestCostConfig = z.infer<typeof BacktestCostConfigSchema>;

export const BacktestRequestSchema = z
  .object({
    strategy: z.string().min(1),
    params: z.record(z.string(), QuantParamValueSchema).default({}),
    assetClass: AssetClassSchema.default("crypto"),
    marketRegion: MarketRegionSchema.default("ton"),
    venue: VenueCodeSchema.optional(),
    provider: ProviderCodeSchema.optional(),
    symbols: z.array(z.string().min(1)).optional(),
    instruments: z.array(InstrumentRefSchema).optional(),
    referenceSymbols: z.array(z.string().min(1)).optional(),
    startDate: DateStringSchema,
    endDate: DateStringSchema,
    weights: z.record(z.string(), z.number()).optional(),
    initialCapital: z.number().positive().optional(),
    costConfig: BacktestCostConfigSchema.optional(),
    datasetPath: z.string().min(1).optional(),
    dataMode: DataModeSchema.optional(),
    outputDir: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      !value.datasetPath &&
      (value.symbols?.length ?? 0) === 0 &&
      (value.instruments?.length ?? 0) === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expected datasetPath, symbols, or instruments.",
        path: ["symbols"],
      });
    }
  });
export type BacktestRequest = z.input<typeof BacktestRequestSchema>;

export const BacktestResultSchema = QuantRunMetaSchema.extend({
  sharpe: z.number(),
  maxDrawdown: z.number().nonnegative(),
  totalReturn: z.number(),
  winRate: z.number().min(0).max(1),
  tradeCount: z.number().int().nonnegative(),
  calmar: z.number(),
  sortino: z.number(),
  maxConsecutiveLossDays: z.number().int().nonnegative().default(0),
  monthlyReturns: z.record(z.string(), z.number()).default({}),
  dailyEquity: z.array(z.number()).default([]),
});
export type BacktestResult = z.infer<typeof BacktestResultSchema>;

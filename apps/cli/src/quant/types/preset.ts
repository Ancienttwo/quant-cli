import { z } from "zod";
import { BacktestCostConfigSchema } from "./backtest.js";
import {
  AssetClassSchema,
  InstrumentRefSchema,
  MarketRegionSchema,
  ProviderCodeSchema,
  QuantParamValueSchema,
  QuantRunMetaSchema,
  VenueCodeSchema,
} from "./base.js";

export const StrategyParameterRangeSchema = z.object({
  min: z.number(),
  max: z.number(),
  step: z.number().positive().optional(),
});
export type StrategyParameterRange = z.infer<typeof StrategyParameterRangeSchema>;

export const PresetSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  strategy: z.string().min(1),
});
export type PresetSummary = z.infer<typeof PresetSummarySchema>;

export const PresetDetailSchema = PresetSummarySchema.extend({
  assetClass: AssetClassSchema,
  marketRegion: MarketRegionSchema,
  venue: VenueCodeSchema,
  provider: ProviderCodeSchema,
  symbols: z.array(z.string().min(1)).default([]),
  instruments: z.array(InstrumentRefSchema).default([]),
  params: z.record(z.string(), QuantParamValueSchema).default({}),
  paramRanges: z.record(z.string(), StrategyParameterRangeSchema).default({}),
  costConfig: BacktestCostConfigSchema.optional(),
  thesis: z.string().optional(),
});
export type PresetDetail = z.infer<typeof PresetDetailSchema>;

export const PresetListRequestSchema = z.object({
  outputDir: z.string().min(1).optional(),
});
export type PresetListRequest = z.input<typeof PresetListRequestSchema>;

export const PresetListResultSchema = QuantRunMetaSchema.extend({
  presets: z.array(PresetSummarySchema).default([]),
});
export type PresetListResult = z.infer<typeof PresetListResultSchema>;

export const PresetShowRequestSchema = z.object({
  presetId: z.string().min(1),
  outputDir: z.string().min(1).optional(),
});
export type PresetShowRequest = z.input<typeof PresetShowRequestSchema>;

export const PresetShowResultSchema = QuantRunMetaSchema.extend({
  preset: PresetDetailSchema,
});
export type PresetShowResult = z.infer<typeof PresetShowResultSchema>;

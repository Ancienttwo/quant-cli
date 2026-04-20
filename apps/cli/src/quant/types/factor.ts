import {
  CostModelSchema,
  FactorDefinitionSchema,
  FactorEvaluationArtifactSchema,
  LiquidityAssumptionsSchema,
} from "@tonquant/core";
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

export const FactorComputeModeSchema = z.enum(["batch"]);
export const FactorSourceSchema = z.enum(["indicator", "liquidity", "derived"]);

export const FactorParameterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  defaultValue: QuantParamValueSchema.optional(),
});
export type FactorParameter = z.infer<typeof FactorParameterSchema>;

export const FactorDescriptorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  description: z.string().min(1),
  parameters: z.array(FactorParameterSchema).default([]),
  inputFields: z.array(z.string()).default([]),
  computeMode: FactorComputeModeSchema.default("batch"),
  source: FactorSourceSchema,
});
export type FactorDescriptor = z.infer<typeof FactorDescriptorSchema>;

export const FactorListRequestSchema = z.object({
  outputDir: z.string().min(1).optional(),
});
export type FactorListRequest = z.input<typeof FactorListRequestSchema>;

export const FactorListResultSchema = QuantRunMetaSchema.extend({
  factors: z.array(FactorDescriptorSchema).default([]),
});
export type FactorListResult = z.infer<typeof FactorListResultSchema>;

export const FactorComputeRequestSchema = z
  .object({
    assetClass: AssetClassSchema.default("crypto"),
    marketRegion: MarketRegionSchema.default("ton"),
    venue: VenueCodeSchema.optional(),
    provider: ProviderCodeSchema.optional(),
    symbols: z.array(z.string().min(1)).optional(),
    instruments: z.array(InstrumentRefSchema).optional(),
    factors: z.array(z.string().min(1)).min(1),
    factorParams: z.record(z.string(), z.record(z.string(), QuantParamValueSchema)).default({}),
    startDate: DateStringSchema.optional(),
    endDate: DateStringSchema.optional(),
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
export type FactorComputeRequest = z.input<typeof FactorComputeRequestSchema>;

export const FactorComputeResultSchema = QuantRunMetaSchema.extend({
  datasetRows: z.number().int().nonnegative(),
  factorCount: z.number().int().nonnegative(),
  symbolCount: z.number().int().nonnegative(),
  factorColumns: z.array(z.string()).default([]),
}).passthrough();
export type FactorComputeResult = z.infer<typeof FactorComputeResultSchema>;

export const FactorEvaluateRequestSchema = z
  .object({
    definition: FactorDefinitionSchema,
    assetClass: AssetClassSchema.default("equity"),
    marketRegion: MarketRegionSchema.default("us"),
    venue: VenueCodeSchema.optional(),
    provider: ProviderCodeSchema.optional(),
    symbols: z.array(z.string().min(1)).optional(),
    instruments: z.array(InstrumentRefSchema).optional(),
    startDate: DateStringSchema.optional(),
    endDate: DateStringSchema.optional(),
    trainRatio: z.number().gt(0).lt(1).default(0.6),
    validationRatio: z.number().gt(0).lt(1).default(0.2),
    pointInTime: z.boolean().default(false),
    survivorshipBiasControlled: z.boolean().default(false),
    nTrials: z.number().int().positive().optional(),
    codeVersion: z.string().min(1).default("local"),
    liquidityAssumptions: LiquidityAssumptionsSchema,
    costModel: CostModelSchema,
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
    if (value.trainRatio + value.validationRatio >= 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "trainRatio + validationRatio must leave room for a non-empty test split.",
        path: ["validationRatio"],
      });
    }
    const inferredMarketType =
      value.definition.universe.marketRegion.toLowerCase() === "ton"
        ? "ton-defi"
        : value.definition.universe.assetClass.toLowerCase() === "equity"
          ? "equity"
          : value.definition.universe.assetClass.toLowerCase() === "crypto"
            ? "crypto"
            : "generic";
    if (value.liquidityAssumptions.marketType !== inferredMarketType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `liquidityAssumptions.marketType must match the factor universe (${inferredMarketType}).`,
        path: ["liquidityAssumptions", "marketType"],
      });
    }
    if (value.costModel.marketType !== inferredMarketType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `costModel.marketType must match the factor universe (${inferredMarketType}).`,
        path: ["costModel", "marketType"],
      });
    }
  });
export type FactorEvaluateRequest = z.input<typeof FactorEvaluateRequestSchema>;

export const FactorEvaluateResultSchema = QuantRunMetaSchema.extend({
  symbolCount: z.number().int().positive(),
  evaluation: FactorEvaluationArtifactSchema,
});
export type FactorEvaluateResult = z.infer<typeof FactorEvaluateResultSchema>;

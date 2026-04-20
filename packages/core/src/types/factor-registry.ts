import { z } from "zod";

// ============================================================
// Factor Registry Schemas
// Single source of truth for marketplace factor metadata.
// v2 introduces factor-native metrics, provenance, and a
// strict separation between factor quality and reference
// backtest metrics. Legacy single-instrument entries remain
// readable as `legacy-signal` records so they can be hidden
// from marketplace rankings without fabricating new metrics.
// ============================================================

export const FactorCategorySchema = z.enum([
  "momentum",
  "value",
  "volatility",
  "liquidity",
  "sentiment",
  "custom",
]);
export type FactorCategory = z.infer<typeof FactorCategorySchema>;

export const FactorSourceTypeSchema = z.enum(["indicator", "liquidity", "derived"]);
export type FactorSourceType = z.infer<typeof FactorSourceTypeSchema>;

export const FactorListingTypeSchema = z.enum(["factor", "legacy-signal"]);
export type FactorListingType = z.infer<typeof FactorListingTypeSchema>;

export const FactorVisibilitySchema = z.enum(["free", "preview", "paid"]);
export type FactorVisibility = z.infer<typeof FactorVisibilitySchema>;

// Factor ID: lowercase alphanumeric + underscores, 3-64 chars
export const FactorIdSchema = z
  .string()
  .regex(/^[a-z0-9_]{3,64}$/u, "Factor ID must be 3-64 chars, lowercase alphanumeric + underscore");

export const FactorParameterEntrySchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  defaultValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
});
export type FactorParameterEntry = z.infer<typeof FactorParameterEntrySchema>;

export const FactorPeriodSchema = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
});
export type FactorPeriod = z.infer<typeof FactorPeriodSchema>;

export const FactorMarketTypeSchema = z.enum(["equity", "crypto", "ton-defi", "generic"]);
export type FactorMarketType = z.infer<typeof FactorMarketTypeSchema>;

export const UniverseLiquidityMetricSchema = z.enum([
  "adv_usd",
  "volume",
  "market_cap_usd",
  "tvl_usd",
  "pool_depth_usd",
  "custom",
]);
export type UniverseLiquidityMetric = z.infer<typeof UniverseLiquidityMetricSchema>;

export const UniverseLiquidityFloorSchema = z
  .object({
    metric: UniverseLiquidityMetricSchema,
    minValue: z.number().nonnegative(),
    lookback: z.string().min(1),
  })
  .strict();
export type UniverseLiquidityFloor = z.infer<typeof UniverseLiquidityFloorSchema>;

export const FactorUniverseSchema = z.object({
  assetClass: z.string().min(1),
  marketRegion: z.string().min(1),
  assets: z.array(z.string().min(1)).default([]),
  coverage: z.string().min(1).default("listed universe"),
  eligibilityRules: z.array(z.string().min(1)).default([]),
  selectionRule: z.string().min(1),
  liquidityFloor: UniverseLiquidityFloorSchema,
  reconstitutionFrequency: z.string().min(1),
});
export type FactorUniverse = z.infer<typeof FactorUniverseSchema>;

export const FactorNormalizationMethodSchema = z.enum([
  "rank",
  "zscore",
  "raw",
  "minmax",
  "robust_zscore",
]);
export type FactorNormalizationMethod = z.infer<typeof FactorNormalizationMethodSchema>;

export const FactorRankStyleSchema = z.enum(["ordinal", "dense", "percentile"]);
export type FactorRankStyle = z.infer<typeof FactorRankStyleSchema>;

export const FactorWinsorizeSchema = z
  .object({
    lowerPct: z.number().min(0).max(0.49),
    upperPct: z.number().min(0).max(0.49),
  })
  .strict()
  .refine(
    ({ lowerPct, upperPct }) => lowerPct + upperPct < 1,
    "Winsorize lowerPct + upperPct must be < 1.",
  );
export type FactorWinsorize = z.infer<typeof FactorWinsorizeSchema>;

export const FactorNormalizationSchema = z
  .object({
    method: FactorNormalizationMethodSchema,
    crossSectional: z.boolean(),
    winsorize: FactorWinsorizeSchema.nullable(),
    rankStyle: FactorRankStyleSchema.nullable(),
  })
  .strict();
export type FactorNormalization = z.infer<typeof FactorNormalizationSchema>;

export const FactorNeutralizationTargetSchema = z.enum([
  "none",
  "sector",
  "country",
  "beta",
  "size",
  "style",
  "venue",
  "chain",
  "marketCapBucket",
  "custom",
]);
export type FactorNeutralizationTarget = z.infer<typeof FactorNeutralizationTargetSchema>;

export const FactorNeutralizationScopeSchema = z.enum([
  "cross_sectional",
  "within_bucket",
  "global",
]);
export type FactorNeutralizationScope = z.infer<typeof FactorNeutralizationScopeSchema>;

export const FactorNeutralizationSchema = z
  .object({
    target: FactorNeutralizationTargetSchema,
    scope: FactorNeutralizationScopeSchema,
    basis: z.string().min(1).optional(),
  })
  .strict();
export type FactorNeutralization = z.infer<typeof FactorNeutralizationSchema>;

export const FactorDefinitionSchema = z.object({
  universe: FactorUniverseSchema,
  signalFormula: z.string().min(1),
  signalDirection: z.enum(["higher_is_better", "lower_is_better"]).default("higher_is_better"),
  neutralization: z.array(FactorNeutralizationSchema).default([]),
  normalization: FactorNormalizationSchema,
  rebalanceFrequency: z.string().min(1),
  holdingHorizon: z.string().min(1),
  timeframe: z.string().min(1),
  assets: z.array(z.string().min(1)).min(1),
});
export type FactorDefinition = z.infer<typeof FactorDefinitionSchema>;

export const FactorDecayPointSchema = z.object({
  horizon: z.string().min(1),
  rankIc: z.number(),
  ic: z.number().optional(),
});
export type FactorDecayPoint = z.infer<typeof FactorDecayPointSchema>;

export const FactorHoldingBucketSchema = z.enum(["short", "medium", "long"]);
export type FactorHoldingBucket = z.infer<typeof FactorHoldingBucketSchema>;

export const FactorStabilitySchema = z
  .object({
    positivePeriodShare: z.number().min(0).max(1),
    worstSubperiodRankIc: z.number(),
    subperiodCount: z.number().int().positive(),
    quantileMonotonicity: z.number().min(0).max(1),
    primaryHoldingBucket: FactorHoldingBucketSchema,
  })
  .strict();
export type FactorStability = z.infer<typeof FactorStabilitySchema>;

export const FactorQualitySchema = z
  .object({
    rankIcOosMean: z.number(),
    rankIcOosIcir: z.number(),
    rankIcOosTstat: z.number(),
    icOosMean: z.number().optional(),
    icOosIcir: z.number().optional(),
    icOosTstat: z.number().optional(),
    quantileSpreadQ5Q1: z.number(),
    icDecay: z.array(FactorDecayPointSchema).min(1),
    oosIsRatio: z.number().nonnegative(),
    halfLifeDays: z.number().nonnegative().nullable().optional(),
    deflatedRankIc: z.number().optional(),
    nTrials: z.number().int().positive().optional(),
    stability: FactorStabilitySchema,
  })
  .strict();
export type FactorQuality = z.infer<typeof FactorQualitySchema>;

export const PeerCorrelationSchema = z.object({
  maxAbs: z.number().min(0).max(1),
  avgAbs: z.number().min(0).max(1).optional(),
  bucket: z.enum(["unique", "typical", "crowded"]).default("typical"),
  universeSize: z.number().int().positive().optional(),
});
export type PeerCorrelation = z.infer<typeof PeerCorrelationSchema>;

export const SlippageModelSchema = z.enum([
  "fixed_bps",
  "adv_participation",
  "square_root",
  "amm_price_impact",
  "custom",
]);
export type SlippageModel = z.infer<typeof SlippageModelSchema>;

const LiquidityAssumptionsBaseSchema = z
  .object({
    marketType: FactorMarketTypeSchema,
    executionLagBars: z.number().int().nonnegative(),
    slippageBps: z.number().nonnegative(),
    notes: z.string().min(1).optional(),
  })
  .strict();

const EquityLiquidityAssumptionsSchema = LiquidityAssumptionsBaseSchema.extend({
  marketType: z.literal("equity"),
  advParticipationPct: z.number().min(0).max(1),
  primaryVenue: z.string().min(1).optional(),
}).strict();

const CryptoLiquidityAssumptionsSchema = LiquidityAssumptionsBaseSchema.extend({
  marketType: z.literal("crypto"),
  advParticipationPct: z.number().min(0).max(1),
  makerTakerBps: z.number().nonnegative().optional(),
  venueFragmentation: z.string().min(1).optional(),
}).strict();

const TonDefiLiquidityAssumptionsSchema = LiquidityAssumptionsBaseSchema.extend({
  marketType: z.literal("ton-defi"),
  poolType: z.string().min(1),
  poolDepthUsd: z.number().nonnegative(),
  maxPoolParticipationPct: z.number().min(0).max(1),
  gasCostUsd: z.number().nonnegative().optional(),
  priceImpactModel: z.string().min(1),
}).strict();

const GenericLiquidityAssumptionsSchema = LiquidityAssumptionsBaseSchema.extend({
  marketType: z.literal("generic"),
  advParticipationPct: z.number().min(0).max(1),
}).strict();

export const LiquidityAssumptionsSchema = z.discriminatedUnion("marketType", [
  EquityLiquidityAssumptionsSchema,
  CryptoLiquidityAssumptionsSchema,
  TonDefiLiquidityAssumptionsSchema,
  GenericLiquidityAssumptionsSchema,
]);
export type LiquidityAssumptions = z.infer<typeof LiquidityAssumptionsSchema>;

export const ImplementationProfileSchema = z
  .object({
    turnoverTwoWay: z.number().nonnegative(),
    capacityMethod: z.string().min(1),
    capacityValue: z.number().nonnegative(),
    liquidityAssumptions: LiquidityAssumptionsSchema,
    peerCorrelation: PeerCorrelationSchema,
  })
  .strict();
export type ImplementationProfile = z.infer<typeof ImplementationProfileSchema>;

export const FactorMetricsSchema = z
  .object({
    factorQuality: FactorQualitySchema,
    implementationProfile: ImplementationProfileSchema,
  })
  .strict();
export type FactorMetrics = z.infer<typeof FactorMetricsSchema>;

const CostModelBaseSchema = z
  .object({
    marketType: FactorMarketTypeSchema,
    included: z.boolean(),
    executionLagBars: z.number().int().nonnegative(),
    feeBps: z.number().nonnegative(),
    slippageModel: SlippageModelSchema,
    notes: z.string().min(1),
  })
  .strict();

const EquityCostModelSchema = CostModelBaseSchema.extend({
  marketType: z.literal("equity"),
  borrowBps: z.number().nonnegative().optional(),
}).strict();

const CryptoCostModelSchema = CostModelBaseSchema.extend({
  marketType: z.literal("crypto"),
  fundingBps: z.number().optional(),
  makerTakerBps: z.number().nonnegative().optional(),
}).strict();

const TonDefiCostModelSchema = CostModelBaseSchema.extend({
  marketType: z.literal("ton-defi"),
  poolType: z.string().min(1),
  priceImpactModel: z.string().min(1),
  gasAssumption: z.string().min(1),
}).strict();

const GenericCostModelSchema = CostModelBaseSchema.extend({
  marketType: z.literal("generic"),
}).strict();

export const CostModelSchema = z.discriminatedUnion("marketType", [
  EquityCostModelSchema,
  CryptoCostModelSchema,
  TonDefiCostModelSchema,
  GenericCostModelSchema,
]);
export type CostModel = z.infer<typeof CostModelSchema>;

export const ValidationProvenanceSchema = z.object({
  trainPeriod: FactorPeriodSchema,
  validationPeriod: FactorPeriodSchema,
  testPeriod: FactorPeriodSchema,
  evaluationFrequency: z.enum(["daily", "weekly", "monthly"]),
  sampleCount: z.number().int().positive(),
  averageUniverseSize: z.number().positive(),
  pointInTime: z.boolean(),
  survivorshipBiasControlled: z.boolean(),
  costModel: CostModelSchema,
  codeVersion: z.string().min(1),
  artifactHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/u)
    .optional(),
});
export type ValidationProvenance = z.infer<typeof ValidationProvenanceSchema>;

export const ReferenceBacktestStrategyMetricsSchema = z.object({
  arr: z.number().optional(),
  sharpe: z.number().optional(),
  calmar: z.number().optional(),
  sortino: z.number().optional(),
  winRate: z.number().min(0).max(1).optional(),
  ytd: z.number().optional(),
  maxDrawdown: z.number().optional(),
});
export type ReferenceBacktestStrategyMetrics = z.infer<
  typeof ReferenceBacktestStrategyMetricsSchema
>;

export const ReferenceBacktestSchema = z.object({
  benchmark: z.string().min(1).optional(),
  netOrGross: z.enum(["gross", "net"]).default("gross"),
  costAssumptions: z.string().min(1).optional(),
  strategyMetrics: ReferenceBacktestStrategyMetricsSchema,
});
export type ReferenceBacktest = z.infer<typeof ReferenceBacktestSchema>;

export const FactorAccessSchema = z.object({
  visibility: FactorVisibilitySchema.default("free"),
});
export type FactorAccess = z.infer<typeof FactorAccessSchema>;

export const FactorRecordIdentitySchema = z.object({
  id: FactorIdSchema,
  name: z.string().min(1),
  author: z.string().min(1),
  category: FactorCategorySchema,
  source: FactorSourceTypeSchema,
  description: z.string().min(1),
  parameters: z.array(FactorParameterEntrySchema).default([]),
  version: z.string().default("1.0.0"),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const FactorMetaPublicSchema = FactorRecordIdentitySchema.extend({
  listingType: z.literal("factor"),
  definition: FactorDefinitionSchema,
  metrics: FactorMetricsSchema,
  provenance: ValidationProvenanceSchema,
  access: FactorAccessSchema.default({ visibility: "free" }),
  referenceBacktest: ReferenceBacktestSchema.optional(),
});
export type FactorMetaPublic = z.infer<typeof FactorMetaPublicSchema>;

export const LegacyFactorBacktestSummarySchema = z.object({
  sharpe: z.number(),
  maxDrawdown: z.number(),
  winRate: z.number(),
  cagr: z.number(),
  dataRange: FactorPeriodSchema,
  tradeCount: z.number().int().nonnegative(),
});
export type LegacyFactorBacktestSummary = z.infer<typeof LegacyFactorBacktestSummarySchema>;

export const LegacySignalMetaPublicSchema = FactorRecordIdentitySchema.extend({
  listingType: z.literal("legacy-signal"),
  definition: z.object({
    timeframe: z.string().min(1),
    assets: z.array(z.string().min(1)).min(1),
  }),
  access: FactorAccessSchema.default({ visibility: "preview" }),
  referenceBacktest: z
    .object({
      benchmark: z.string().min(1).optional(),
      netOrGross: z.enum(["gross", "net"]).default("gross"),
      costAssumptions: z.string().min(1).optional(),
      strategyMetrics: ReferenceBacktestStrategyMetricsSchema.extend({
        arr: z.number(),
        sharpe: z.number(),
        maxDrawdown: z.number(),
        winRate: z.number().min(0).max(1),
      }),
    })
    .optional(),
  legacyNote: z.string().default("Legacy single-instrument signal kept for research only."),
});
export type LegacySignalMetaPublic = z.infer<typeof LegacySignalMetaPublicSchema>;

const LegacyNormalizationSchema = z.string().min(1);
const LegacyNeutralizationSchema = z.array(z.string().min(1)).default([]);
const LegacyLiquidityAssumptionsSchema = z
  .object({
    advParticipationPct: z.number().min(0).max(1).optional(),
    slippageBps: z.number().nonnegative().optional(),
    notes: z.string().min(1).optional(),
  })
  .strict();
const LegacyCostModelSchema = z
  .object({
    included: z.boolean(),
    description: z.string().min(1),
  })
  .strict();
const LegacyFactorQualityV1Schema = z
  .object({
    rankIcOosMean: z.number(),
    rankIcOosIcir: z.number(),
    rankIcOosTstat: z.number(),
    icOosMean: z.number().optional(),
    icOosIcir: z.number().optional(),
    icOosTstat: z.number().optional(),
    quantileSpreadQ5Q1: z.number(),
    icDecay: z.array(FactorDecayPointSchema).min(1),
    oosIsRatio: z.number().nonnegative(),
    halfLifeDays: z.number().nonnegative().nullable().optional(),
    deflatedRankIc: z.number().optional(),
    nTrials: z.number().int().positive().optional(),
  })
  .strict();
const LegacyFactorMetricsV1Schema = z
  .object({
    factorQuality: LegacyFactorQualityV1Schema,
    implementationProfile: z
      .object({
        turnoverTwoWay: z.number().nonnegative(),
        capacityMethod: z.string().min(1),
        capacityValue: z.number().nonnegative(),
        liquidityAssumptions: LegacyLiquidityAssumptionsSchema.default({}),
        peerCorrelation: PeerCorrelationSchema,
      })
      .strict(),
  })
  .strict();
const LegacyFactorMetaPublicV1Schema = FactorRecordIdentitySchema.extend({
  listingType: z.literal("factor"),
  definition: z
    .object({
      universe: z
        .object({
          assetClass: z.string().min(1),
          marketRegion: z.string().min(1),
          assets: z.array(z.string().min(1)).default([]),
          coverage: z.string().min(1).default("listed universe"),
          eligibilityRules: z.array(z.string().min(1)).default([]),
        })
        .strict(),
      signalFormula: z.string().min(1),
      signalDirection: z.enum(["higher_is_better", "lower_is_better"]).default("higher_is_better"),
      neutralization: LegacyNeutralizationSchema,
      normalization: LegacyNormalizationSchema,
      rebalanceFrequency: z.string().min(1),
      holdingHorizon: z.string().min(1),
      timeframe: z.string().min(1),
      assets: z.array(z.string().min(1)).min(1),
    })
    .strict(),
  metrics: LegacyFactorMetricsV1Schema,
  provenance: z
    .object({
      trainPeriod: FactorPeriodSchema,
      validationPeriod: FactorPeriodSchema,
      testPeriod: FactorPeriodSchema,
      evaluationFrequency: z.enum(["daily", "weekly", "monthly"]),
      sampleCount: z.number().int().positive(),
      averageUniverseSize: z.number().positive(),
      pointInTime: z.boolean(),
      survivorshipBiasControlled: z.boolean(),
      costModel: LegacyCostModelSchema,
      codeVersion: z.string().min(1),
      artifactHash: z
        .string()
        .regex(/^[0-9a-f]{64}$/u)
        .optional(),
    })
    .strict(),
  access: FactorAccessSchema.default({ visibility: "free" }),
  referenceBacktest: ReferenceBacktestSchema.optional(),
});

const LegacyFactorV0Schema = z.object({
  id: FactorIdSchema,
  name: z.string().min(1),
  author: z.string().min(1),
  category: FactorCategorySchema,
  source: FactorSourceTypeSchema,
  assets: z.array(z.string().min(1)).min(1),
  timeframe: z.string().min(1),
  description: z.string().min(1),
  parameters: z.array(FactorParameterEntrySchema).default([]),
  backtest: LegacyFactorBacktestSummarySchema,
  visibility: FactorVisibilitySchema.default("free"),
  version: z.string().default("1.0.0"),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const StoredFactorMetaPublicSchema = z.union([
  FactorMetaPublicSchema,
  LegacySignalMetaPublicSchema,
  LegacyFactorMetaPublicV1Schema,
  LegacyFactorV0Schema,
]);
export type StoredFactorMetaPublic = z.infer<typeof StoredFactorMetaPublicSchema>;

function inferMarketType(assetClass: string, marketRegion: string): FactorMarketType {
  const normalizedAssetClass = assetClass.trim().toLowerCase();
  const normalizedRegion = marketRegion.trim().toLowerCase();

  if (normalizedRegion === "ton") {
    return "ton-defi";
  }
  if (normalizedAssetClass === "equity") {
    return "equity";
  }
  if (normalizedAssetClass === "crypto") {
    return normalizedRegion === "ton" ? "ton-defi" : "crypto";
  }
  return "generic";
}

function parseHoldingHorizonDays(horizon: string): number | null {
  const match = /^(\d+)([dwm])$/iu.exec(horizon.trim());
  if (!match) {
    return null;
  }

  const amount = Number.parseInt(match[1] ?? "1", 10);
  const unit = (match[2] ?? "d").toLowerCase();
  if (unit === "w") return amount * 5;
  if (unit === "m") return amount * 21;
  return amount;
}

function holdingBucketFor(horizon: string): FactorHoldingBucket {
  const days = parseHoldingHorizonDays(horizon) ?? 5;
  if (days <= 5) return "short";
  if (days <= 20) return "medium";
  return "long";
}

function normalizeLegacyNeutralization(values: string[]): FactorNeutralization[] {
  return values.map((value) => {
    const trimmed = value.trim();
    const normalized = trimmed.toLowerCase();
    if (
      normalized === "none" ||
      normalized === "sector" ||
      normalized === "country" ||
      normalized === "beta" ||
      normalized === "size" ||
      normalized === "style" ||
      normalized === "venue" ||
      normalized === "chain" ||
      normalized === "marketcapbucket"
    ) {
      return FactorNeutralizationSchema.parse({
        target:
          normalized === "marketcapbucket"
            ? "marketCapBucket"
            : (normalized as FactorNeutralizationTarget),
        scope: normalized === "none" ? "global" : "cross_sectional",
      });
    }

    return FactorNeutralizationSchema.parse({
      target: "custom",
      scope: "cross_sectional",
      basis: trimmed,
    });
  });
}

function normalizeLegacyNormalization(value: string): FactorNormalization {
  const normalized = value.trim().toLowerCase();
  const method =
    normalized === "zscore" ||
    normalized === "raw" ||
    normalized === "minmax" ||
    normalized === "robust_zscore"
      ? normalized
      : "rank";
  return FactorNormalizationSchema.parse({
    method,
    crossSectional: true,
    winsorize: null,
    rankStyle: method === "rank" ? "ordinal" : null,
  });
}

function normalizeLegacyStability(params: {
  factorQuality: z.infer<typeof LegacyFactorQualityV1Schema>;
  holdingHorizon: string;
}): FactorStability {
  return FactorStabilitySchema.parse({
    positivePeriodShare: params.factorQuality.rankIcOosMean > 0 ? 1 : 0,
    worstSubperiodRankIc: params.factorQuality.rankIcOosMean,
    subperiodCount: 1,
    quantileMonotonicity: params.factorQuality.quantileSpreadQ5Q1 >= 0 ? 1 : 0,
    primaryHoldingBucket: holdingBucketFor(params.holdingHorizon),
  });
}

function normalizeLegacyLiquidityAssumptions(params: {
  assetClass: string;
  marketRegion: string;
  value: z.infer<typeof LegacyLiquidityAssumptionsSchema>;
}): LiquidityAssumptions {
  const marketType = inferMarketType(params.assetClass, params.marketRegion);
  const slippageBps = params.value.slippageBps ?? 0;
  const executionLagBars = 1;

  if (marketType === "equity") {
    return LiquidityAssumptionsSchema.parse({
      marketType,
      executionLagBars,
      slippageBps,
      advParticipationPct: params.value.advParticipationPct ?? 0,
      notes: params.value.notes,
    });
  }
  if (marketType === "crypto") {
    return LiquidityAssumptionsSchema.parse({
      marketType,
      executionLagBars,
      slippageBps,
      advParticipationPct: params.value.advParticipationPct ?? 0,
      notes: params.value.notes,
    });
  }
  if (marketType === "ton-defi") {
    return LiquidityAssumptionsSchema.parse({
      marketType,
      executionLagBars,
      slippageBps,
      poolType: "legacy-unspecified",
      poolDepthUsd: 0,
      maxPoolParticipationPct: 0,
      priceImpactModel: "legacy-unspecified",
      notes: params.value.notes,
    });
  }
  return LiquidityAssumptionsSchema.parse({
    marketType: "generic",
    executionLagBars,
    slippageBps,
    advParticipationPct: params.value.advParticipationPct ?? 0,
    notes: params.value.notes,
  });
}

function normalizeLegacyCostModel(params: {
  assetClass: string;
  marketRegion: string;
  value: z.infer<typeof LegacyCostModelSchema>;
}): CostModel {
  const marketType = inferMarketType(params.assetClass, params.marketRegion);

  if (marketType === "equity") {
    return CostModelSchema.parse({
      marketType,
      included: params.value.included,
      executionLagBars: 1,
      feeBps: 0,
      slippageModel: "fixed_bps",
      notes: params.value.description,
    });
  }
  if (marketType === "crypto") {
    return CostModelSchema.parse({
      marketType,
      included: params.value.included,
      executionLagBars: 1,
      feeBps: 0,
      slippageModel: "fixed_bps",
      notes: params.value.description,
    });
  }
  if (marketType === "ton-defi") {
    return CostModelSchema.parse({
      marketType,
      included: params.value.included,
      executionLagBars: 1,
      feeBps: 0,
      slippageModel: "amm_price_impact",
      notes: params.value.description,
      poolType: "legacy-unspecified",
      priceImpactModel: "legacy-unspecified",
      gasAssumption: "legacy-unspecified",
    });
  }
  return CostModelSchema.parse({
    marketType: "generic",
    included: params.value.included,
    executionLagBars: 1,
    feeBps: 0,
    slippageModel: "fixed_bps",
    notes: params.value.description,
  });
}

export function normalizeStoredFactorMetaPublic(
  input: StoredFactorMetaPublic,
): FactorMetaPublic | LegacySignalMetaPublic {
  const parsed = StoredFactorMetaPublicSchema.parse(input);
  if (!("listingType" in parsed)) {
    return LegacySignalMetaPublicSchema.parse({
      id: parsed.id,
      name: parsed.name,
      author: parsed.author,
      category: parsed.category,
      source: parsed.source,
      description: parsed.description,
      parameters: parsed.parameters,
      version: parsed.version,
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt,
      listingType: "legacy-signal",
      definition: {
        timeframe: parsed.timeframe,
        assets: parsed.assets,
      },
      access: { visibility: parsed.visibility },
      referenceBacktest: {
        benchmark: undefined,
        netOrGross: "gross",
        costAssumptions: undefined,
        strategyMetrics: {
          arr: parsed.backtest.cagr,
          sharpe: parsed.backtest.sharpe,
          calmar: undefined,
          sortino: undefined,
          winRate: parsed.backtest.winRate,
          ytd: undefined,
          maxDrawdown: parsed.backtest.maxDrawdown,
        },
      },
      legacyNote:
        "Legacy single-instrument signal migrated from backtest-centric registry metadata.",
    });
  }

  if (parsed.listingType === "legacy-signal") {
    return parsed;
  }

  if (typeof parsed.definition.normalization === "string") {
    const legacyParsed = parsed as z.infer<typeof LegacyFactorMetaPublicV1Schema>;
    const marketType = inferMarketType(
      legacyParsed.definition.universe.assetClass,
      legacyParsed.definition.universe.marketRegion,
    );

    return FactorMetaPublicSchema.parse({
      ...legacyParsed,
      definition: {
        ...legacyParsed.definition,
        universe: {
          ...legacyParsed.definition.universe,
          selectionRule: "legacy-unspecified",
          liquidityFloor: {
            metric:
              marketType === "ton-defi"
                ? "pool_depth_usd"
                : marketType === "equity"
                  ? "adv_usd"
                  : "volume",
            minValue: 0,
            lookback: "legacy-unspecified",
          },
          reconstitutionFrequency: legacyParsed.definition.rebalanceFrequency,
        },
        neutralization: normalizeLegacyNeutralization(legacyParsed.definition.neutralization),
        normalization: normalizeLegacyNormalization(legacyParsed.definition.normalization),
      },
      metrics: {
        factorQuality: {
          ...legacyParsed.metrics.factorQuality,
          stability: normalizeLegacyStability({
            factorQuality: legacyParsed.metrics.factorQuality,
            holdingHorizon: legacyParsed.definition.holdingHorizon,
          }),
        },
        implementationProfile: {
          ...legacyParsed.metrics.implementationProfile,
          liquidityAssumptions: normalizeLegacyLiquidityAssumptions({
            assetClass: legacyParsed.definition.universe.assetClass,
            marketRegion: legacyParsed.definition.universe.marketRegion,
            value: legacyParsed.metrics.implementationProfile.liquidityAssumptions,
          }),
        },
      },
      provenance: {
        ...legacyParsed.provenance,
        costModel: normalizeLegacyCostModel({
          assetClass: legacyParsed.definition.universe.assetClass,
          marketRegion: legacyParsed.definition.universe.marketRegion,
          value: legacyParsed.provenance.costModel,
        }),
      },
    });
  }

  return parsed as FactorMetaPublic;
}

// ── Private layer (visible after subscribe/purchase) ───────
export const FactorMetaPrivateSchema = z.object({
  parameterValues: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .default({}),
  formula: z.string().optional(),
  universeRules: z.array(z.string().min(1)).default([]),
  rebalanceSchedule: z.string().optional(),
  evaluationArtifactPath: z.string().min(1).optional(),
  artifactBundlePath: z.string().min(1).optional(),
  signalThresholds: z
    .object({
      buy: z.number(),
      sell: z.number(),
    })
    .optional(),
});
export type FactorMetaPrivate = z.infer<typeof FactorMetaPrivateSchema>;

// ── Full factor (public + private combined) ────────────────
export const FactorRegistryEntrySchema = z.object({
  public: z.union([
    FactorMetaPublicSchema,
    LegacySignalMetaPublicSchema,
    LegacyFactorMetaPublicV1Schema,
  ]),
  private: FactorMetaPrivateSchema.optional(),
});
export type FactorRegistryEntry = z.infer<typeof FactorRegistryEntrySchema>;

// ── Registry index ─────────────────────────────────────────
export const FactorRegistryIndexSchema = z.object({
  version: z.string().default("2.0.0"),
  factors: z.array(StoredFactorMetaPublicSchema).default([]),
});
export type FactorRegistryIndex = z.infer<typeof FactorRegistryIndexSchema>;

export const FactorEvaluationArtifactSchema = z.object({
  definition: FactorDefinitionSchema,
  metrics: FactorMetricsSchema,
  provenance: ValidationProvenanceSchema,
  referenceBacktest: ReferenceBacktestSchema.optional(),
});
export type FactorEvaluationArtifact = z.infer<typeof FactorEvaluationArtifactSchema>;

// ── Subscription record ────────────────────────────────────
export const FactorSubscriptionSchema = z.object({
  factorId: FactorIdSchema,
  subscribedAt: z.string(),
  subscribedVersion: z.string(),
});
export type FactorSubscription = z.infer<typeof FactorSubscriptionSchema>;

export const SubscriptionFileSchema = z.object({
  subscriptions: z.array(FactorSubscriptionSchema).default([]),
});

// ── Social proof report ────────────────────────────────────
export const FactorPerformanceReportSchema = z.object({
  factorId: FactorIdSchema,
  agentId: z.string().min(1),
  returnPct: z.number(),
  period: z.string().min(1),
  reportedAt: z.string(),
  verified: z.literal(false).default(false),
});
export type FactorPerformanceReport = z.infer<typeof FactorPerformanceReportSchema>;

export const FactorAlertMetricSchema = z.enum([
  "rankIcOosIcir",
  "turnoverTwoWay",
  "peerCorrelationMaxAbs",
]);
export type FactorAlertMetric = z.infer<typeof FactorAlertMetricSchema>;

// ── Alert definition ───────────────────────────────────────
export const FactorAlertSchema = z.object({
  factorId: FactorIdSchema,
  metric: FactorAlertMetricSchema.default("rankIcOosIcir"),
  condition: z.enum(["above", "below"]),
  threshold: z.number(),
  createdAt: z.string(),
  active: z.boolean().default(true),
});
export type FactorAlert = z.infer<typeof FactorAlertSchema>;

export const AlertsFileSchema = z.object({
  alerts: z.array(FactorAlertSchema).default([]),
});

export const ReportsFileSchema = z.object({
  reports: z.array(FactorPerformanceReportSchema).default([]),
});

export function isFactorListing(
  input: FactorMetaPublic | LegacySignalMetaPublic | StoredFactorMetaPublic,
): input is FactorMetaPublic {
  const normalized = normalizeStoredFactorMetaPublic(input);
  return normalized.listingType === "factor";
}

export function sampleAdequacyError(provenance: ValidationProvenance): string | null {
  const minSampleCount =
    provenance.evaluationFrequency === "daily"
      ? 252
      : provenance.evaluationFrequency === "weekly"
        ? 52
        : 24;
  if (provenance.sampleCount < minSampleCount) {
    return `Expected at least ${minSampleCount} ${provenance.evaluationFrequency} OOS observations, got ${provenance.sampleCount}.`;
  }
  if (provenance.averageUniverseSize < 50) {
    return `Expected average cross-sectional universe size >= 50, got ${provenance.averageUniverseSize}.`;
  }
  return null;
}

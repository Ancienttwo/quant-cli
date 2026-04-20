import type {
  FactorMetaPrivate,
  FactorMetaPublic,
  FactorRegistryEntry,
  LegacySignalMetaPublic,
  ReferenceBacktest,
} from "../../src/types/factor-registry.js";

const NOW = "2026-03-24T00:00:00Z";

export function makeFactor(
  id: string,
  overrides: Partial<FactorMetaPublic> = {},
): FactorMetaPublic {
  const base: FactorMetaPublic = {
    id,
    name: `Factor ${id}`,
    author: "test",
    category: "momentum",
    source: "indicator",
    description: `Test factor ${id}`,
    parameters: [],
    version: "1.0.0",
    createdAt: NOW,
    updatedAt: NOW,
    listingType: "factor",
    definition: {
      universe: {
        assetClass: "equity",
        marketRegion: "us",
        assets: ["AAPL", "MSFT", "NVDA", "AMZN", "META"],
        coverage: "large-cap test universe",
        eligibilityRules: ["min_price > 5", "top_liquidity_bucket"],
        selectionRule: "top 60 names by trailing dollar volume",
        liquidityFloor: {
          metric: "adv_usd",
          minValue: 5_000_000,
          lookback: "20d",
        },
        reconstitutionFrequency: "monthly",
      },
      signalFormula: "return_20d",
      signalDirection: "higher_is_better",
      neutralization: [{ target: "sector", scope: "cross_sectional" }],
      normalization: {
        method: "rank",
        crossSectional: true,
        winsorize: null,
        rankStyle: "ordinal",
      },
      rebalanceFrequency: "weekly",
      holdingHorizon: "5d",
      timeframe: "1d",
      assets: ["AAPL", "MSFT", "NVDA", "AMZN", "META"],
    },
    metrics: {
      factorQuality: {
        rankIcOosMean: 0.034,
        rankIcOosIcir: 1.25,
        rankIcOosTstat: 2.6,
        icOosMean: 0.03,
        icOosIcir: 1.1,
        icOosTstat: 2.4,
        quantileSpreadQ5Q1: 0.012,
        icDecay: [
          { horizon: "1d", rankIc: 0.034, ic: 0.03 },
          { horizon: "5d", rankIc: 0.022, ic: 0.019 },
        ],
        oosIsRatio: 0.82,
        halfLifeDays: null,
        deflatedRankIc: 0.034,
        nTrials: 1,
        stability: {
          positivePeriodShare: 0.61,
          worstSubperiodRankIc: 0.012,
          subperiodCount: 4,
          quantileMonotonicity: 0.74,
          primaryHoldingBucket: "short",
        },
      },
      implementationProfile: {
        turnoverTwoWay: 0.21,
        capacityMethod: "adv_participation",
        capacityValue: 2500000,
        liquidityAssumptions: {
          marketType: "equity",
          executionLagBars: 1,
          advParticipationPct: 0.05,
          slippageBps: 10,
          notes: "fixture assumptions",
        },
        peerCorrelation: {
          maxAbs: 0.28,
          avgAbs: 0.16,
          bucket: "unique",
          universeSize: 7,
        },
      },
    },
    provenance: {
      trainPeriod: { start: "2024-01-01", end: "2024-12-31" },
      validationPeriod: { start: "2025-01-01", end: "2025-06-30" },
      testPeriod: { start: "2025-07-01", end: "2026-03-01" },
      evaluationFrequency: "daily",
      sampleCount: 252,
      averageUniverseSize: 75,
      pointInTime: true,
      survivorshipBiasControlled: true,
      costModel: {
        marketType: "equity",
        included: true,
        executionLagBars: 1,
        feeBps: 2,
        slippageModel: "fixed_bps",
        notes: "10 bps slippage fixture",
      },
      codeVersion: "fixture-sha",
    },
    access: { visibility: "free" },
    referenceBacktest: {
      benchmark: "simple_long_short_decile",
      netOrGross: "gross",
      costAssumptions: "fixture",
      strategyMetrics: {
        arr: 0.18,
        sharpe: 1.4,
        calmar: 0.9,
        sortino: 1.8,
        winRate: 0.56,
        ytd: 0.05,
        maxDrawdown: 0.12,
      },
    },
  };

  return {
    ...base,
    ...overrides,
    definition: {
      ...base.definition,
      ...overrides.definition,
      universe: {
        ...base.definition.universe,
        ...overrides.definition?.universe,
      },
    },
    metrics: {
      factorQuality: {
        ...base.metrics.factorQuality,
        ...overrides.metrics?.factorQuality,
      },
      implementationProfile: {
        ...base.metrics.implementationProfile,
        ...overrides.metrics?.implementationProfile,
        liquidityAssumptions: {
          ...base.metrics.implementationProfile.liquidityAssumptions,
          ...overrides.metrics?.implementationProfile?.liquidityAssumptions,
        },
        peerCorrelation: {
          ...base.metrics.implementationProfile.peerCorrelation,
          ...overrides.metrics?.implementationProfile?.peerCorrelation,
        },
      },
    },
    provenance: {
      ...base.provenance,
      ...overrides.provenance,
      trainPeriod: {
        ...base.provenance.trainPeriod,
        ...overrides.provenance?.trainPeriod,
      },
      validationPeriod: {
        ...base.provenance.validationPeriod,
        ...overrides.provenance?.validationPeriod,
      },
      testPeriod: {
        ...base.provenance.testPeriod,
        ...overrides.provenance?.testPeriod,
      },
      costModel: {
        ...base.provenance.costModel,
        ...overrides.provenance?.costModel,
      },
    },
    access: {
      ...base.access,
      ...overrides.access,
    },
    referenceBacktest:
      overrides.referenceBacktest === undefined
        ? base.referenceBacktest
        : ({
            ...base.referenceBacktest,
            ...overrides.referenceBacktest,
            strategyMetrics: {
              ...base.referenceBacktest?.strategyMetrics,
              ...overrides.referenceBacktest.strategyMetrics,
            },
          } as LegacySignalMetaPublic["referenceBacktest"]),
  };
}

function mergeReferenceBacktest(
  base: ReferenceBacktest | undefined,
  override: ReferenceBacktest | undefined,
): ReferenceBacktest | undefined {
  if (!base) return override;
  if (!override) return override;
  return {
    ...base,
    ...override,
    strategyMetrics: {
      ...base.strategyMetrics,
      ...override.strategyMetrics,
    },
  } as ReferenceBacktest;
}

export function makeLegacySignal(
  id: string,
  overrides: Partial<LegacySignalMetaPublic> = {},
): LegacySignalMetaPublic {
  const base: LegacySignalMetaPublic = {
    id,
    name: `Signal ${id}`,
    author: "test",
    category: "momentum",
    source: "indicator",
    description: `Legacy signal ${id}`,
    parameters: [],
    version: "1.0.0",
    createdAt: NOW,
    updatedAt: NOW,
    listingType: "legacy-signal",
    definition: {
      timeframe: "1d",
      assets: ["TON"],
    },
    access: { visibility: "preview" },
    referenceBacktest: {
      benchmark: undefined,
      netOrGross: "gross",
      costAssumptions: "legacy fixture",
      strategyMetrics: {
        arr: 0.2,
        sharpe: 1.5,
        calmar: 0.8,
        sortino: 1.7,
        winRate: 0.55,
        ytd: undefined,
        maxDrawdown: 0.14,
      },
    },
    legacyNote: "Legacy fixture",
  };

  return {
    ...base,
    ...overrides,
    definition: {
      ...base.definition,
      ...overrides.definition,
    },
    access: {
      ...base.access,
      ...overrides.access,
    },
    referenceBacktest:
      overrides.referenceBacktest === undefined
        ? base.referenceBacktest
        : (mergeReferenceBacktest(
            base.referenceBacktest,
            overrides.referenceBacktest,
          ) as LegacySignalMetaPublic["referenceBacktest"]),
  };
}

export function makeFactorEntry(
  id: string,
  overrides: Partial<FactorMetaPublic> = {},
  privateOverrides: Partial<FactorMetaPrivate> = {},
): FactorRegistryEntry {
  return {
    public: makeFactor(id, overrides),
    private: {
      parameterValues: {},
      universeRules: [],
      ...privateOverrides,
    },
  };
}

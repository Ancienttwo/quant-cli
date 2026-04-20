import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Override CONFIG_DIR before importing registry
const _TEST_DIR = join(tmpdir(), `tonquant-registry-test-${Date.now()}`);

// We need to mock CONFIG_DIR. Since the registry uses it via import,
// we test the schemas directly and integration-test through the service.
import {
  FactorAlertSchema,
  FactorCategorySchema,
  FactorEvaluationArtifactSchema,
  FactorIdSchema,
  FactorMetaPrivateSchema,
  FactorMetaPublicSchema,
  FactorMetricsSchema,
  FactorPerformanceReportSchema,
  FactorQualitySchema,
  FactorRegistryIndexSchema,
  FactorSubscriptionSchema,
  LegacyFactorBacktestSummarySchema,
  normalizeStoredFactorMetaPublic,
  ValidationProvenanceSchema,
} from "../../src/types/factor-registry.js";
import { makeFactor } from "../helpers/factor-fixtures.js";

const validFactor = makeFactor("mom_30d_ton", {
  name: "30-Day Momentum",
  description: "30-day momentum factor for TON",
});

// ── Schema validation tests ────────────────────────────────

describe("FactorIdSchema", () => {
  test("accepts valid IDs", () => {
    expect(FactorIdSchema.parse("mom_30d_ton")).toBe("mom_30d_ton");
    expect(FactorIdSchema.parse("rsi")).toBe("rsi");
    expect(FactorIdSchema.parse("vol_7d")).toBe("vol_7d");
  });

  test("rejects invalid IDs", () => {
    expect(() => FactorIdSchema.parse("ab")).toThrow(); // too short
    expect(() => FactorIdSchema.parse("UPPERCASE")).toThrow(); // uppercase
    expect(() => FactorIdSchema.parse("has-dashes")).toThrow(); // dashes
    expect(() => FactorIdSchema.parse("has spaces")).toThrow(); // spaces
    expect(() => FactorIdSchema.parse("a".repeat(65))).toThrow(); // too long
  });
});

describe("FactorCategorySchema", () => {
  test("accepts valid categories", () => {
    expect(FactorCategorySchema.parse("momentum")).toBe("momentum");
    expect(FactorCategorySchema.parse("value")).toBe("value");
    expect(FactorCategorySchema.parse("volatility")).toBe("volatility");
    expect(FactorCategorySchema.parse("liquidity")).toBe("liquidity");
    expect(FactorCategorySchema.parse("sentiment")).toBe("sentiment");
    expect(FactorCategorySchema.parse("custom")).toBe("custom");
  });

  test("rejects invalid categories", () => {
    expect(() => FactorCategorySchema.parse("invalid")).toThrow();
    expect(() => FactorCategorySchema.parse("")).toThrow();
  });
});

describe("LegacyFactorBacktestSummarySchema", () => {
  test("validates complete legacy backtest", () => {
    const bt = {
      sharpe: 1.5,
      maxDrawdown: -0.15,
      winRate: 0.62,
      cagr: 0.25,
      dataRange: { start: "2026-01-01", end: "2026-03-01" },
      tradeCount: 42,
    };
    expect(LegacyFactorBacktestSummarySchema.parse(bt)).toEqual(bt);
  });

  test("rejects missing fields", () => {
    expect(() => LegacyFactorBacktestSummarySchema.parse({ sharpe: 1.5 })).toThrow();
  });

  test("rejects negative trade count", () => {
    expect(() =>
      LegacyFactorBacktestSummarySchema.parse({
        sharpe: 1.5,
        maxDrawdown: -0.1,
        winRate: 0.5,
        cagr: 0.1,
        dataRange: { start: "2026-01-01", end: "2026-03-01" },
        tradeCount: -1,
      }),
    ).toThrow();
  });
});

describe("FactorMetaPublicSchema", () => {
  test("validates complete factor metadata", () => {
    const result = FactorMetaPublicSchema.parse(validFactor);
    expect(result.id).toBe("mom_30d_ton");
    expect(result.category).toBe("momentum");
    expect(result.metrics.factorQuality.rankIcOosIcir).toBeGreaterThan(0);
  });

  test("rejects missing required fields", () => {
    const { id: _, ...noId } = validFactor;
    expect(() => FactorMetaPublicSchema.parse(noId)).toThrow();
  });

  test("rejects empty assets array", () => {
    expect(() =>
      FactorMetaPublicSchema.parse({
        ...validFactor,
        definition: {
          ...validFactor.definition,
          assets: [],
          universe: { ...validFactor.definition.universe, assets: [] },
        },
      }),
    ).toThrow();
  });

  test("defaults visibility to free", () => {
    const { access: _, ...noVis } = validFactor;
    const result = FactorMetaPublicSchema.parse(noVis);
    expect(result.access.visibility).toBe("free");
  });

  test("defaults version to 1.0.0", () => {
    const { version: _, ...noVer } = validFactor;
    const result = FactorMetaPublicSchema.parse(noVer);
    expect(result.version).toBe("1.0.0");
  });
});

describe("FactorMetaPrivateSchema", () => {
  test("validates private data", () => {
    const priv = {
      parameterValues: { window: 30, threshold: 0.5 },
      formula: "sma(close, window) / close - 1",
      signalThresholds: { buy: 0.02, sell: -0.01 },
    };
    const result = FactorMetaPrivateSchema.parse(priv);
    expect(result.parameterValues.window).toBe(30);
  });

  test("allows minimal private data", () => {
    const result = FactorMetaPrivateSchema.parse({ parameterValues: {} });
    expect(result.parameterValues).toEqual({});
  });
});

describe("FactorMetricsSchema", () => {
  test("rejects strategy-only headline fields", () => {
    expect(() =>
      FactorMetricsSchema.parse({
        factorQuality: {
          ...validFactor.metrics.factorQuality,
          sharpe: 2.1,
        },
        implementationProfile: validFactor.metrics.implementationProfile,
      }),
    ).toThrow();
  });

  test("rejects factor-quality payloads that omit the new stability disclosure block", () => {
    const { stability: _stability, ...legacyFactorQuality } = validFactor.metrics.factorQuality;
    expect(() =>
      FactorMetricsSchema.parse({
        factorQuality: legacyFactorQuality,
        implementationProfile: validFactor.metrics.implementationProfile,
      }),
    ).toThrow();
  });

  test("normalizes legacy stored factor entries into the new contract for read compatibility", () => {
    const normalized = normalizeStoredFactorMetaPublic({
      ...validFactor,
      definition: {
        ...validFactor.definition,
        universe: {
          assetClass: validFactor.definition.universe.assetClass,
          marketRegion: validFactor.definition.universe.marketRegion,
          assets: validFactor.definition.universe.assets,
          coverage: validFactor.definition.universe.coverage,
          eligibilityRules: validFactor.definition.universe.eligibilityRules,
        },
        neutralization: ["sector"],
        normalization: "rank",
      },
      metrics: {
        factorQuality: {
          rankIcOosMean: validFactor.metrics.factorQuality.rankIcOosMean,
          rankIcOosIcir: validFactor.metrics.factorQuality.rankIcOosIcir,
          rankIcOosTstat: validFactor.metrics.factorQuality.rankIcOosTstat,
          icOosMean: validFactor.metrics.factorQuality.icOosMean,
          icOosIcir: validFactor.metrics.factorQuality.icOosIcir,
          icOosTstat: validFactor.metrics.factorQuality.icOosTstat,
          quantileSpreadQ5Q1: validFactor.metrics.factorQuality.quantileSpreadQ5Q1,
          icDecay: validFactor.metrics.factorQuality.icDecay,
          oosIsRatio: validFactor.metrics.factorQuality.oosIsRatio,
          halfLifeDays: validFactor.metrics.factorQuality.halfLifeDays,
          deflatedRankIc: validFactor.metrics.factorQuality.deflatedRankIc,
          nTrials: validFactor.metrics.factorQuality.nTrials,
        },
        implementationProfile: {
          ...validFactor.metrics.implementationProfile,
          liquidityAssumptions: {
            advParticipationPct: 0.05,
            slippageBps: 10,
            notes: "legacy fixture assumptions",
          },
        },
      },
      provenance: {
        ...validFactor.provenance,
        costModel: {
          included: true,
          description: "legacy fixture cost model",
        },
      },
    });

    expect(normalized.listingType).toBe("factor");
    if (normalized.listingType !== "factor") {
      throw new Error("Expected normalized factor listing.");
    }
    expect(normalized.definition.normalization.method).toBe("rank");
    expect(normalized.metrics.factorQuality.stability.primaryHoldingBucket).toBe("short");
  });
});

describe("FactorQualitySchema", () => {
  test("accepts halfLifeDays=null as a disclosed no-crossing value", () => {
    const parsed = FactorQualitySchema.parse({
      ...validFactor.metrics.factorQuality,
      halfLifeDays: null,
    });
    expect(parsed.halfLifeDays).toBeNull();
  });

  test("rejects non-positive nTrials", () => {
    expect(() =>
      FactorQualitySchema.parse({
        ...validFactor.metrics.factorQuality,
        nTrials: 0,
      }),
    ).toThrow();
  });

  test("rejects negative halfLifeDays", () => {
    expect(() =>
      FactorQualitySchema.parse({
        ...validFactor.metrics.factorQuality,
        halfLifeDays: -1,
      }),
    ).toThrow();
  });
});

describe("ValidationProvenanceSchema", () => {
  test("rejects missing provenance fields", () => {
    expect(() => ValidationProvenanceSchema.parse({ sampleCount: 5 })).toThrow();
  });
});

describe("FactorEvaluationArtifactSchema", () => {
  test("parses a complete evaluation artifact", () => {
    const parsed = FactorEvaluationArtifactSchema.parse({
      definition: validFactor.definition,
      metrics: validFactor.metrics,
      provenance: validFactor.provenance,
      referenceBacktest: validFactor.referenceBacktest,
    });
    expect(parsed.definition.signalFormula).toBe(validFactor.definition.signalFormula);
  });
});

describe("FactorRegistryIndexSchema", () => {
  test("parses empty index", () => {
    const result = FactorRegistryIndexSchema.parse({});
    expect(result.version).toBe("2.0.0");
    expect(result.factors).toEqual([]);
  });
});

describe("FactorSubscriptionSchema", () => {
  test("validates subscription", () => {
    const sub = {
      factorId: "mom_30d_ton",
      subscribedAt: "2026-03-24T00:00:00Z",
      subscribedVersion: "1.0.0",
    };
    expect(FactorSubscriptionSchema.parse(sub)).toEqual(sub);
  });
});

describe("FactorPerformanceReportSchema", () => {
  test("validates report with verified=false default", () => {
    const report = {
      factorId: "mom_30d_ton",
      agentId: "openclaw_agent_1",
      returnPct: 0.12,
      period: "7d",
      reportedAt: "2026-03-24T00:00:00Z",
    };
    const result = FactorPerformanceReportSchema.parse(report);
    expect(result.verified).toBe(false);
  });
});

describe("FactorAlertSchema", () => {
  test("validates alert", () => {
    const alert = {
      factorId: "mom_30d_ton",
      metric: "rankIcOosIcir" as const,
      condition: "above" as const,
      threshold: 0.8,
      createdAt: "2026-03-24T00:00:00Z",
    };
    const result = FactorAlertSchema.parse(alert);
    expect(result.active).toBe(true);
  });
});

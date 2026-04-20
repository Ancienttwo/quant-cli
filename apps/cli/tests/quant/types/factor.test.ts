import { describe, expect, test } from "bun:test";
import { FactorEvaluateRequestSchema } from "../../../src/quant/types/factor.js";

const baseRequest = {
  definition: {
    universe: {
      assetClass: "equity",
      marketRegion: "us",
      assets: ["AAPL", "MSFT", "NVDA"],
      coverage: "large-cap universe",
      eligibilityRules: ["top 60 by liquidity"],
      selectionRule: "top 60 names by trailing dollar volume",
      liquidityFloor: {
        metric: "adv_usd",
        minValue: 5_000_000,
        lookback: "20d",
      },
      reconstitutionFrequency: "monthly",
    },
    signalFormula: "return_20d",
    signalDirection: "higher_is_better" as const,
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
    assets: ["AAPL", "MSFT", "NVDA"],
  },
  symbols: ["AAPL", "MSFT", "NVDA"],
  liquidityAssumptions: {
    marketType: "equity" as const,
    executionLagBars: 1,
    advParticipationPct: 0.05,
    slippageBps: 10,
    notes: "test liquidity assumptions",
  },
  costModel: {
    marketType: "equity" as const,
    included: true,
    executionLagBars: 1,
    feeBps: 2,
    slippageModel: "fixed_bps" as const,
    notes: "test cost model",
  },
};

describe("FactorEvaluateRequestSchema", () => {
  test("accepts nTrials when present", () => {
    const parsed = FactorEvaluateRequestSchema.parse({
      ...baseRequest,
      nTrials: 5,
    });
    expect(parsed.nTrials).toBe(5);
  });

  test("accepts requests without nTrials", () => {
    const parsed = FactorEvaluateRequestSchema.parse(baseRequest);
    expect(parsed.nTrials).toBeUndefined();
  });

  test("rejects non-positive nTrials", () => {
    expect(() =>
      FactorEvaluateRequestSchema.parse({
        ...baseRequest,
        nTrials: 0,
      }),
    ).toThrow();
  });
});

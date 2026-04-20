import { describe, expect, test } from "bun:test";
// @ts-expect-error - backend fixtures are runtime-tested outside the CLI tsconfig boundary
import {
  deflatedRankIcLowerBound,
  handleFactorEvaluate,
} from "../../../../quant-backend/src/handlers/evaluation.ts";

const SYMBOLS = Array.from({ length: 60 }, (_, index) => `TST${index + 1}`);

describe("factor evaluation handler", () => {
  test("computes a trial-adjusted IC lower bound with the expected monotonic behavior", () => {
    const noPenalty = deflatedRankIcLowerBound(0.12, 252, 1);
    const mediumPenalty = deflatedRankIcLowerBound(0.12, 252, 4);
    const largerSample = deflatedRankIcLowerBound(0.12, 504, 4);

    expect(noPenalty).toBe(0.12);
    expect(mediumPenalty).toEqual(expect.any(Number));
    expect(largerSample).toEqual(expect.any(Number));
    expect(mediumPenalty as number).toBeLessThan(noPenalty as number);
    expect(largerSample as number).toBeGreaterThanOrEqual(mediumPenalty as number);
    expect(deflatedRankIcLowerBound(0.12, 2, 4)).toBeUndefined();
    expect(deflatedRankIcLowerBound(0.12, 252, 0)).toBeUndefined();
  });

  test("computes a factor-evaluation artifact for a cross-sectional universe", async () => {
    const result = await handleFactorEvaluate({
      definition: {
        universe: {
          assetClass: "equity",
          marketRegion: "us",
          assets: ["AAPL", "MSFT", "NVDA"],
          coverage: "synthetic us universe",
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
        assets: ["AAPL", "MSFT", "NVDA"],
      },
      assetClass: "equity",
      marketRegion: "us",
      provider: "synthetic",
      symbols: SYMBOLS,
      startDate: "2024-01-01",
      endDate: "2025-06-30",
      pointInTime: true,
      survivorshipBiasControlled: true,
      nTrials: 5,
      codeVersion: "test-sha",
      liquidityAssumptions: {
        marketType: "equity",
        executionLagBars: 1,
        advParticipationPct: 0.05,
        slippageBps: 10,
        notes: "backend evaluation fixture liquidity",
      },
      costModel: {
        marketType: "equity",
        included: true,
        executionLagBars: 1,
        feeBps: 2,
        slippageModel: "fixed_bps",
        notes: "backend evaluation fixture cost",
      },
    });

    expect(result.status).toBe("completed");
    const evaluation = result.evaluation as {
      metrics: {
        factorQuality: {
          deflatedRankIc?: number;
          halfLifeDays: number | null;
          nTrials?: number;
          rankIcOosIcir: number;
          rankIcOosMean: number;
          icDecay: Array<{ horizon: string }>;
          stability: { positivePeriodShare: number; quantileMonotonicity: number };
        };
        implementationProfile: {
          turnoverTwoWay: number;
          peerCorrelation: { maxAbs: number };
        };
      };
      provenance: {
        sampleCount: number;
        averageUniverseSize: number;
      };
    };
    expect(evaluation.metrics.factorQuality.icDecay.length).toBeGreaterThan(0);
    expect(Number.isFinite(evaluation.metrics.factorQuality.rankIcOosIcir)).toBe(true);
    expect(Number.isFinite(evaluation.metrics.factorQuality.rankIcOosMean)).toBe(true);
    expect(evaluation.metrics.factorQuality.stability.positivePeriodShare).toBeGreaterThanOrEqual(
      0,
    );
    expect(evaluation.metrics.factorQuality.stability.quantileMonotonicity).toBeGreaterThanOrEqual(
      0,
    );
    expect(evaluation.metrics.factorQuality.nTrials).toBe(5);
    expect("halfLifeDays" in evaluation.metrics.factorQuality).toBe(true);
    expect(evaluation.metrics.factorQuality.deflatedRankIc).toBe(
      deflatedRankIcLowerBound(
        evaluation.metrics.factorQuality.rankIcOosMean,
        evaluation.provenance.sampleCount,
        5,
      ),
    );
    expect(Number.isFinite(evaluation.metrics.implementationProfile.turnoverTwoWay)).toBe(true);
    expect(Number.isFinite(evaluation.metrics.implementationProfile.peerCorrelation.maxAbs)).toBe(
      true,
    );
    expect(evaluation.provenance.sampleCount).toBeGreaterThan(0);
    expect(evaluation.provenance.averageUniverseSize).toBeGreaterThan(0);
  });

  test("omits nTrials and deflatedRankIc when trial disclosure is missing but still emits halfLifeDays", async () => {
    const result = await handleFactorEvaluate({
      definition: {
        universe: {
          assetClass: "equity",
          marketRegion: "us",
          assets: ["AAPL", "MSFT", "NVDA"],
          coverage: "synthetic us universe",
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
        assets: ["AAPL", "MSFT", "NVDA"],
      },
      assetClass: "equity",
      marketRegion: "us",
      provider: "synthetic",
      symbols: SYMBOLS,
      startDate: "2024-01-01",
      endDate: "2025-06-30",
      pointInTime: true,
      survivorshipBiasControlled: true,
      codeVersion: "test-sha",
      liquidityAssumptions: {
        marketType: "equity",
        executionLagBars: 1,
        advParticipationPct: 0.05,
        slippageBps: 10,
        notes: "backend evaluation fixture liquidity",
      },
      costModel: {
        marketType: "equity",
        included: true,
        executionLagBars: 1,
        feeBps: 2,
        slippageModel: "fixed_bps",
        notes: "backend evaluation fixture cost",
      },
    });

    const factorQuality = (
      result.evaluation as { metrics: { factorQuality: Record<string, unknown> } }
    ).metrics.factorQuality;

    expect("halfLifeDays" in factorQuality).toBe(true);
    expect("nTrials" in factorQuality).toBe(false);
    expect("deflatedRankIc" in factorQuality).toBe(false);
  });
});

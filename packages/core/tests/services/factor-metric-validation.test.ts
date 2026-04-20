import { describe, expect, test } from "bun:test";
import {
  validateFactorMarketplaceContract,
  validateFactorMetricsCompleteness,
} from "../../src/services/factor-metric-validation.js";
import { makeFactor } from "../helpers/factor-fixtures.js";

describe("validateFactorMetricsCompleteness", () => {
  test("accepts complete factor-quality payloads and treats halfLifeDays=null as disclosed", () => {
    const factorQuality = makeFactor("complete_metric_factor").metrics.factorQuality;
    expect(validateFactorMetricsCompleteness(factorQuality)).toEqual([]);
  });

  test("returns every missing factor-quality field", () => {
    const {
      halfLifeDays: _halfLifeDays,
      deflatedRankIc: _deflatedRankIc,
      nTrials: _nTrials,
      ...rest
    } = makeFactor("missing_metric_factor").metrics.factorQuality;
    expect(
      validateFactorMetricsCompleteness({
        ...rest,
        halfLifeDays: undefined,
        deflatedRankIc: undefined,
        nTrials: undefined,
      }),
    ).toEqual(["halfLifeDays", "deflatedRankIc", "nTrials"]);
  });

  test("returns only the missing fields when disclosure is partial", () => {
    const { deflatedRankIc: _deflatedRankIc, ...rest } =
      makeFactor("partial_metric_factor").metrics.factorQuality;
    expect(
      validateFactorMetricsCompleteness({
        ...rest,
        deflatedRankIc: undefined,
      }),
    ).toEqual(["deflatedRankIc"]);
  });

  test("returns hard gate failures for marketplace minimum bars", () => {
    const factor = makeFactor("hard_fail_factor", {
      metrics: {
        factorQuality: {
          rankIcOosMean: 0.01,
          rankIcOosIcir: 0.2,
          rankIcOosTstat: 1.2,
          oosIsRatio: 0.3,
        },
      },
    });

    const result = validateFactorMarketplaceContract({
      factorQuality: factor.metrics.factorQuality,
      implementationProfile: factor.metrics.implementationProfile,
      provenance: factor.provenance,
    });

    expect(result.hardFailures.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "RANK_IC_TOO_LOW",
        "ICIR_TOO_LOW",
        "TSTAT_TOO_LOW",
        "OOS_IS_RATIO_TOO_LOW",
      ]),
    );
  });

  test("returns soft warnings for disclosed but fragile metrics", () => {
    const factor = makeFactor("soft_warn_factor", {
      metrics: {
        factorQuality: {
          halfLifeDays: null,
          deflatedRankIc: -0.01,
          stability: {
            positivePeriodShare: 0.6,
            worstSubperiodRankIc: -0.02,
            subperiodCount: 4,
            quantileMonotonicity: 0.7,
            primaryHoldingBucket: "short",
          },
        },
        implementationProfile: {
          capacityValue: 0,
        },
      },
    });

    const result = validateFactorMarketplaceContract({
      factorQuality: factor.metrics.factorQuality,
      implementationProfile: factor.metrics.implementationProfile,
      provenance: factor.provenance,
    });

    expect(result.softWarnings.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "HALF_LIFE_UNAVAILABLE",
        "DEFLATED_RANK_IC_NEGATIVE",
        "WORST_SUBPERIOD_NEGATIVE",
        "CAPACITY_NON_POSITIVE",
      ]),
    );
  });
});

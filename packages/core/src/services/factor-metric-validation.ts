import type {
  FactorQuality,
  ImplementationProfile,
  ValidationProvenance,
} from "../types/factor-registry.js";
import { sampleAdequacyError } from "../types/factor-registry.js";

export const REQUIRED_FACTOR_QUALITY_FIELDS = [
  "halfLifeDays",
  "deflatedRankIc",
  "nTrials",
  "stability.positivePeriodShare",
  "stability.quantileMonotonicity",
] as const;

export type RequiredFactorQualityField = (typeof REQUIRED_FACTOR_QUALITY_FIELDS)[number];

export interface FactorValidationIssue {
  field: string;
  code: string;
  message: string;
}

export interface FactorMarketplaceValidationResult {
  missingFields: RequiredFactorQualityField[];
  hardFailures: FactorValidationIssue[];
  softWarnings: FactorValidationIssue[];
}

export function validateFactorMetricsCompleteness(
  factorQuality: Partial<FactorQuality>,
): RequiredFactorQualityField[] {
  return REQUIRED_FACTOR_QUALITY_FIELDS.filter((field) => {
    switch (field) {
      case "halfLifeDays":
        return factorQuality.halfLifeDays === undefined;
      case "deflatedRankIc":
        return factorQuality.deflatedRankIc === undefined;
      case "nTrials":
        return factorQuality.nTrials === undefined;
      case "stability.positivePeriodShare":
        return factorQuality.stability?.positivePeriodShare === undefined;
      case "stability.quantileMonotonicity":
        return factorQuality.stability?.quantileMonotonicity === undefined;
      default:
        return true;
    }
  });
}

export function validateFactorMarketplaceContract(input: {
  factorQuality: Partial<FactorQuality>;
  implementationProfile?: Pick<ImplementationProfile, "capacityValue">;
  provenance?: ValidationProvenance;
}): FactorMarketplaceValidationResult {
  const missingFields = validateFactorMetricsCompleteness(input.factorQuality);
  const hardFailures: FactorValidationIssue[] = [];
  const softWarnings: FactorValidationIssue[] = [];

  if (input.provenance) {
    const adequacyError = sampleAdequacyError(input.provenance);
    if (adequacyError) {
      hardFailures.push({
        field: "provenance",
        code: "SAMPLE_INADEQUATE",
        message: adequacyError,
      });
    }
  }

  const rankIcOosMean = input.factorQuality.rankIcOosMean;
  if (rankIcOosMean !== undefined && rankIcOosMean < 0.02) {
    hardFailures.push({
      field: "rankIcOosMean",
      code: "RANK_IC_TOO_LOW",
      message: `Expected rankIcOosMean >= 0.02, got ${rankIcOosMean}.`,
    });
  }

  const rankIcOosIcir = input.factorQuality.rankIcOosIcir;
  if (rankIcOosIcir !== undefined && rankIcOosIcir < 0.5) {
    hardFailures.push({
      field: "rankIcOosIcir",
      code: "ICIR_TOO_LOW",
      message: `Expected rankIcOosIcir >= 0.5, got ${rankIcOosIcir}.`,
    });
  }

  const rankIcOosTstat = input.factorQuality.rankIcOosTstat;
  if (rankIcOosTstat !== undefined && rankIcOosTstat < 2) {
    hardFailures.push({
      field: "rankIcOosTstat",
      code: "TSTAT_TOO_LOW",
      message: `Expected rankIcOosTstat >= 2.0, got ${rankIcOosTstat}.`,
    });
  }

  const oosIsRatio = input.factorQuality.oosIsRatio;
  if (oosIsRatio !== undefined && oosIsRatio < 0.5) {
    hardFailures.push({
      field: "oosIsRatio",
      code: "OOS_IS_RATIO_TOO_LOW",
      message: `Expected oosIsRatio >= 0.5, got ${oosIsRatio}.`,
    });
  }

  if (input.factorQuality.halfLifeDays === null) {
    softWarnings.push({
      field: "halfLifeDays",
      code: "HALF_LIFE_UNAVAILABLE",
      message:
        "halfLifeDays is disclosed as unavailable. This is allowed, but weakens persistence evidence.",
    });
  }

  const deflatedRankIc = input.factorQuality.deflatedRankIc;
  if (deflatedRankIc !== undefined && deflatedRankIc < 0) {
    softWarnings.push({
      field: "deflatedRankIc",
      code: "DEFLATED_RANK_IC_NEGATIVE",
      message: `deflatedRankIc is negative (${deflatedRankIc}). Keep the disclosure, but expect buyers to treat the factor as fragile.`,
    });
  }

  const worstSubperiodRankIc = input.factorQuality.stability?.worstSubperiodRankIc;
  if (worstSubperiodRankIc !== undefined && worstSubperiodRankIc < 0) {
    softWarnings.push({
      field: "stability.worstSubperiodRankIc",
      code: "WORST_SUBPERIOD_NEGATIVE",
      message: `worstSubperiodRankIc is negative (${worstSubperiodRankIc}). Stability is disclosed, but the factor has at least one weak subperiod.`,
    });
  }

  const capacityValue = input.implementationProfile?.capacityValue;
  if (capacityValue !== undefined && capacityValue <= 0) {
    softWarnings.push({
      field: "capacityValue",
      code: "CAPACITY_NON_POSITIVE",
      message: `capacityValue is ${capacityValue}. Capacity disclosure is present, but the estimate is not commercially useful.`,
    });
  }

  return {
    missingFields,
    hardFailures,
    softWarnings,
  };
}

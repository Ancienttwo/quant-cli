import { SEED_FACTORS } from "../data/seed-factors.js";
import { DuplicateFactorError, listFactors, publishFactor } from "./registry.js";

/**
 * Populate the registry with built-in seed factors.
 * Skips factors that already exist unless force is true.
 * Returns the number of factors published.
 */
export function seedRegistry(opts?: { force?: boolean }): number {
  const existing = new Set(listFactors().map((f) => f.id));
  let published = 0;

  for (const factor of SEED_FACTORS) {
    if (!opts?.force && existing.has(factor.id)) continue;

    try {
      publishFactor(factor, { force: opts?.force });
      published += 1;
    } catch (err) {
      if (err instanceof DuplicateFactorError && !opts?.force) continue;
      throw err;
    }
  }

  return published;
}

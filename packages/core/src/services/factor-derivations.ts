import type { FactorDecayPoint } from "../types/factor-registry.js";

function parseDayHorizon(horizon: string): number | null {
  const match = /^(\d+)d$/iu.exec(horizon.trim());
  if (!match) {
    return null;
  }

  return Number(match[1]);
}

export function icHalfLifeDays(icDecay: readonly FactorDecayPoint[]): number | null {
  if (icDecay.length === 0) {
    return null;
  }

  let baselineIndex = -1;
  let baselineMagnitude = 0;

  for (const [index, point] of icDecay.entries()) {
    const days = parseDayHorizon(point.horizon);
    if (days === null) {
      continue;
    }

    baselineIndex = index;
    baselineMagnitude = Math.abs(point.rankIc);
    break;
  }

  if (baselineIndex < 0 || baselineMagnitude <= 0) {
    return null;
  }

  const halfLifeThreshold = baselineMagnitude * 0.5;

  for (const point of icDecay.slice(baselineIndex)) {
    const days = parseDayHorizon(point.horizon);
    if (days === null) {
      continue;
    }

    if (Math.abs(point.rankIc) <= halfLifeThreshold) {
      return days;
    }
  }

  return null;
}

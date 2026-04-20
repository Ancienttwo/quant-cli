import { describe, expect, test } from "bun:test";
import { icHalfLifeDays } from "../../src/services/factor-derivations.js";

describe("icHalfLifeDays", () => {
  test("returns the first day horizon that crosses the 50% threshold", () => {
    expect(
      icHalfLifeDays([
        { horizon: "1d", rankIc: 0.08 },
        { horizon: "3d", rankIc: 0.06 },
        { horizon: "5d", rankIc: 0.04 },
        { horizon: "10d", rankIc: 0.02 },
      ]),
    ).toBe(5);
  });

  test("returns null for an empty decay series", () => {
    expect(icHalfLifeDays([])).toBeNull();
  });

  test("returns null when the series never crosses the threshold", () => {
    expect(
      icHalfLifeDays([
        { horizon: "1d", rankIc: 0.05 },
        { horizon: "3d", rankIc: 0.04 },
        { horizon: "5d", rankIc: 0.03 },
      ]),
    ).toBeNull();
  });

  test("anchors on the first parseable day horizon when the series starts at 3d", () => {
    expect(
      icHalfLifeDays([
        { horizon: "3d", rankIc: 0.08 },
        { horizon: "5d", rankIc: 0.03 },
        { horizon: "10d", rankIc: 0.02 },
      ]),
    ).toBe(5);
  });

  test("skips non-day horizons before the first parseable day baseline", () => {
    expect(
      icHalfLifeDays([
        { horizon: "1w", rankIc: 0.12 },
        { horizon: "3d", rankIc: 0.08 },
        { horizon: "5d", rankIc: 0.03 },
      ]),
    ).toBe(5);
  });

  test("skips non-day horizons after the baseline anchor and keeps scanning", () => {
    expect(
      icHalfLifeDays([
        { horizon: "1d", rankIc: 0.06 },
        { horizon: "1w", rankIc: 0.02 },
        { horizon: "10d", rankIc: 0.03 },
      ]),
    ).toBe(10);
  });

  test("returns null when no horizon is expressed in days", () => {
    expect(
      icHalfLifeDays([
        { horizon: "1w", rankIc: 0.06 },
        { horizon: "2w", rankIc: 0.03 },
        { horizon: "1M", rankIc: 0.02 },
      ]),
    ).toBeNull();
  });

  test("returns null when the first day baseline is zero", () => {
    expect(
      icHalfLifeDays([
        { horizon: "1d", rankIc: 0 },
        { horizon: "3d", rankIc: 0 },
      ]),
    ).toBeNull();
  });

  test("returns null for a single positive day-horizon baseline with no later crossing", () => {
    expect(icHalfLifeDays([{ horizon: "5d", rankIc: 0.08 }])).toBeNull();
  });
});

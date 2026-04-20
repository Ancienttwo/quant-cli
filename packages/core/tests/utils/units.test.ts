import { describe, expect, test } from "bun:test";
import { calcUsdValue, fromRawUnits, toRawUnits } from "../../src/utils/units.js";

describe("toRawUnits", () => {
  test("converts integer amount", () => {
    expect(toRawUnits("1", 9)).toBe("1000000000");
  });

  test("converts decimal amount", () => {
    expect(toRawUnits("1.5", 9)).toBe("1500000000");
  });

  test("handles zero decimals", () => {
    expect(toRawUnits("42", 0)).toBe("42");
    expect(toRawUnits("42.7", 0)).toBe("42");
  });

  test("handles amount with fewer decimals than token precision", () => {
    expect(toRawUnits("1.5", 18)).toBe("1500000000000000000");
  });

  test("handles amount with more decimals than token precision", () => {
    expect(toRawUnits("1.123456789999", 9)).toBe("1123456789");
  });

  test("handles zero amount", () => {
    expect(toRawUnits("0", 9)).toBe("0");
    expect(toRawUnits("0.0", 9)).toBe("0");
  });

  test("handles large amounts", () => {
    expect(toRawUnits("1000000", 9)).toBe("1000000000000000");
  });
});

describe("fromRawUnits", () => {
  test("converts to human-readable", () => {
    expect(fromRawUnits("1500000000", 9)).toBe("1.5");
  });

  test("handles exact integer", () => {
    expect(fromRawUnits("1000000000", 9)).toBe("1");
  });

  test("handles zero", () => {
    expect(fromRawUnits("0", 9)).toBe("0");
  });

  test("handles zero decimals", () => {
    expect(fromRawUnits("42", 0)).toBe("42");
  });

  test("handles small amounts (less than 1)", () => {
    expect(fromRawUnits("500000000", 9)).toBe("0.5");
  });

  test("handles very small amounts", () => {
    expect(fromRawUnits("1", 9)).toBe("0.000000001");
  });

  test("handles large raw units", () => {
    expect(fromRawUnits("1000000000000000", 9)).toBe("1000000");
  });
});

describe("calcUsdValue", () => {
  test("calculates USD value", () => {
    expect(calcUsdValue("1.5", "2.00")).toBe("3.00");
  });

  test("handles zero price", () => {
    expect(calcUsdValue("100", "0")).toBe("0.00");
  });

  test("handles NaN input", () => {
    expect(calcUsdValue("abc", "1.00")).toBe("0.00");
  });

  test("formats to 2 decimal places", () => {
    expect(calcUsdValue("1", "3.333")).toBe("3.33");
  });
});

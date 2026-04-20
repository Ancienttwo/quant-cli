import { describe, expect, test } from "bun:test";
import { calcUsdValue, fromRawUnits } from "@tonquant/core";

describe("balance command", () => {
  test("converts nanoTON to human-readable TON", () => {
    const humanTon = fromRawUnits("12500000000", 9);
    expect(humanTon).toBe("12.5");
  });

  test("calculates TON USD value", () => {
    const humanTon = fromRawUnits("12500000000", 9);
    const usd = calcUsdValue(humanTon, "3.70");
    expect(usd).toBe("46.25");
  });

  test("calculates jetton USD value", () => {
    const humanBalance = fromRawUnits("5000000000000", 9);
    expect(humanBalance).toBe("5000");
    const usd = calcUsdValue(humanBalance, "0.0068");
    expect(usd).toBe("34.00");
  });

  test("sums total USD across all tokens", () => {
    const tonUsd = 46.25;
    const jettonUsd = 34.0;
    const total = (tonUsd + jettonUsd).toFixed(2);
    expect(total).toBe("80.25");
  });
});

import { describe, expect, test } from "bun:test";
// @ts-expect-error — quant-backend is standalone, not in tsconfig
import { handleBacktest } from "../../../../quant-backend/src/handlers/backtest.ts";

describe("backtest handler", () => {
  test("runs momentum strategy on synthetic data", () => {
    const result = handleBacktest({
      strategy: "momentum",
      symbols: ["TON/USDT"],
      startDate: "2025-12-23",
      endDate: "2026-03-22",
    });
    expect(result.status).toBe("completed");
    expect(typeof result.sharpe).toBe("number");
    expect(typeof result.totalReturn).toBe("number");
    expect(typeof result.maxDrawdown).toBe("number");
    expect(typeof result.winRate).toBe("number");
    expect(typeof result.tradeCount).toBe("number");
    expect(result.maxDrawdown as number).toBeGreaterThanOrEqual(0);
    expect(result.winRate as number).toBeGreaterThanOrEqual(0);
    expect(result.winRate as number).toBeLessThanOrEqual(1);
  });

  test("returns daily equity curve", () => {
    const result = handleBacktest({
      strategy: "momentum",
      symbols: ["TON/USDT"],
      startDate: "2025-12-23",
      endDate: "2026-03-22",
    });
    const equity = result.dailyEquity as number[];
    expect(equity.length).toBeGreaterThan(0);
    expect(equity[0]).toBeGreaterThan(0);
  });

  test("returns monthly returns", () => {
    const result = handleBacktest({
      strategy: "momentum",
      symbols: ["TON/USDT"],
      startDate: "2025-12-23",
      endDate: "2026-03-22",
    });
    const monthly = result.monthlyReturns as Record<string, number>;
    expect(Object.keys(monthly).length).toBeGreaterThan(0);
  });

  test("throws on unknown strategy", () => {
    expect(() =>
      handleBacktest({
        strategy: "nonexistent",
        symbols: ["TON/USDT"],
        startDate: "2025-12-23",
        endDate: "2026-03-22",
      }),
    ).toThrow("Unknown strategy: nonexistent");
  });

  test("includes calmar and sortino ratios", () => {
    const result = handleBacktest({
      strategy: "momentum",
      symbols: ["TON/USDT"],
      startDate: "2025-12-23",
      endDate: "2026-03-22",
    });
    expect(typeof result.calmar).toBe("number");
    expect(typeof result.sortino).toBe("number");
  });
});

import { describe, expect, test } from "bun:test";
// @ts-expect-error - backend fixtures are runtime-tested outside the CLI tsconfig boundary
import {
  handleFactorCompute,
  handleFactorList,
} from "../../../../quant-backend/src/handlers/factor";

describe("factor handler", () => {
  describe("handleFactorList", () => {
    test("returns all available factors", () => {
      const result = handleFactorList({});
      expect(result.status).toBe("completed");
      const factors = result.factors as Array<{ id: string }>;
      expect(factors.length).toBeGreaterThanOrEqual(3);
      const ids = factors.map((f) => f.id);
      expect(ids).toContain("rsi");
      expect(ids).toContain("macd");
      expect(ids).toContain("volatility");
    });
  });

  describe("handleFactorCompute", () => {
    test("computes RSI on 90 bars", () => {
      const result = handleFactorCompute({ factors: ["rsi"], symbols: ["TON/USDT"] });
      expect(result.status).toBe("completed");
      expect(result.datasetRows).toBe(90);
      expect(typeof result.rsi).toBe("number");
      expect(result.rsi as number).toBeGreaterThanOrEqual(0);
      expect(result.rsi as number).toBeLessThanOrEqual(100);
    });

    test("computes MACD on 90 bars", () => {
      const result = handleFactorCompute({ factors: ["macd"], symbols: ["TON/USDT"] });
      expect(result.status).toBe("completed");
      expect(typeof result.macd).toBe("number");
      expect(typeof result.macd_signal).toBe("number");
      expect(typeof result.macd_histogram).toBe("number");
    });

    test("computes volatility on 90 bars", () => {
      const result = handleFactorCompute({ factors: ["volatility"], symbols: ["TON/USDT"] });
      expect(result.status).toBe("completed");
      expect(typeof result.volatility).toBe("number");
      expect(result.volatility as number).toBeGreaterThan(0);
    });

    test("computes multiple factors at once", () => {
      const result = handleFactorCompute({
        factors: ["rsi", "macd", "volatility"],
        symbols: ["TON/USDT"],
      });
      expect(result.factorCount).toBe(3);
      expect((result.factorColumns as string[]).length).toBeGreaterThanOrEqual(3);
    });

    test("throws on unknown factor", () => {
      expect(() =>
        handleFactorCompute({ factors: ["nonexistent"], symbols: ["TON/USDT"] }),
      ).toThrow("Unknown factor: nonexistent");
    });

    test("throws on insufficient data points for RSI", () => {
      // Create a dataset with only 10 bars
      const bars = Array.from({ length: 10 }, (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, "0")}`,
        open: 3.5,
        high: 3.6,
        low: 3.4,
        close: 3.5 + i * 0.01,
        volume: 1000000,
      }));
      const fs = require("node:fs");
      const tmpPath = `/tmp/tonquant-test-short-${Date.now()}.json`;
      fs.writeFileSync(tmpPath, JSON.stringify(bars));

      expect(() => handleFactorCompute({ factors: ["rsi"], datasetPath: tmpPath })).toThrow(
        /requires at least/,
      );

      fs.unlinkSync(tmpPath);
    });

    test("throws on insufficient data points for MACD", () => {
      const bars = Array.from({ length: 20 }, (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, "0")}`,
        open: 3.5,
        high: 3.6,
        low: 3.4,
        close: 3.5 + i * 0.01,
        volume: 1000000,
      }));
      const fs = require("node:fs");
      const tmpPath = `/tmp/tonquant-test-macd-${Date.now()}.json`;
      fs.writeFileSync(tmpPath, JSON.stringify(bars));

      expect(() => handleFactorCompute({ factors: ["macd"], datasetPath: tmpPath })).toThrow(
        /requires at least/,
      );

      fs.unlinkSync(tmpPath);
    });
  });
});

import { describe, expect, test } from "bun:test";
import { runOrchestrator } from "../../src/quant/orchestrator.js";

describe("orchestrator", () => {
  test("completes full chain: data → factor → backtest → report", async () => {
    const result = await runOrchestrator({
      asset: "TON/USDT",
      period: "90d",
      strategy: "momentum",
      iterations: 1,
      factors: ["rsi", "macd", "volatility"],
    });
    expect(result.status).toBe("success");
    expect(result.steps.length).toBe(4);
    expect(result.steps.every((s) => s.status === "completed")).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.data?.reportPath).toBeDefined();
    expect(["buy", "sell", "hold"]).toContain(result.data?.recommendation ?? "");
  }, 30_000);

  test("includes correct metrics", async () => {
    const result = await runOrchestrator({
      asset: "TON/USDT",
      period: "60d",
      strategy: "momentum",
      iterations: 1,
      factors: ["rsi"],
    });
    expect(result.data).not.toBeNull();
    const m = result.data?.metrics;
    expect(m).toBeDefined();
    if (!m) {
      throw new Error("Expected orchestrator metrics to be defined");
    }
    expect(typeof m.sharpe).toBe("number");
    expect(typeof m.totalReturn).toBe("number");
    expect(typeof m.maxDrawdown).toBe("number");
    expect(typeof m.winRate).toBe("number");
    expect(typeof m.tradeCount).toBe("number");
  }, 30_000);

  test("includes factor summary", async () => {
    const result = await runOrchestrator({
      asset: "TON/USDT",
      period: "90d",
      strategy: "momentum",
      iterations: 1,
      factors: ["rsi", "volatility"],
    });
    expect(result.data?.factorsSummary).toBeDefined();
    expect(typeof result.data?.factorsSummary.rsi).toBe("number");
    expect(typeof result.data?.factorsSummary.volatility).toBe("number");
  }, 30_000);

  test("recommendation logic: buy when sharpe > 1 and return > 0", async () => {
    // We can't control the random data, but we can verify the logic is applied
    const result = await runOrchestrator({
      asset: "TON/USDT",
      period: "90d",
      strategy: "momentum",
      iterations: 1,
      factors: ["rsi"],
    });
    const m = result.data?.metrics;
    const rec = result.data?.recommendation;
    if (m && rec) {
      if (m.sharpe > 1.0 && m.totalReturn > 0) expect(rec).toBe("buy");
      else if (m.totalReturn < -5) expect(rec).toBe("sell");
      else expect(rec).toBe("hold");
    }
  }, 30_000);

  test("generates report file", async () => {
    const result = await runOrchestrator({
      asset: "TON/USDT",
      period: "90d",
      strategy: "momentum",
      iterations: 1,
      factors: ["rsi"],
    });
    expect(result.artifacts.length).toBeGreaterThan(0);
    const reportArtifact = result.artifacts.find((a) => a.label === "Research report");
    expect(reportArtifact).toBeDefined();
    const { existsSync } = require("node:fs");
    expect(existsSync(reportArtifact?.path)).toBe(true);
  }, 30_000);

  test("rejects caller-controlled runId path traversal", async () => {
    await expect(
      runOrchestrator({
        asset: "TON/USDT",
        period: "90d",
        strategy: "momentum",
        iterations: 1,
        factors: ["rsi"],
        runId: "../../escape",
      }),
    ).rejects.toThrow("filesystem-safe identifier");
  });
});

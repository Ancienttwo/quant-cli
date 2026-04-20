import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { SEED_FACTORS } from "../../src/data/seed-factors.js";
import { listFactors } from "../../src/services/registry.js";
import { seedRegistry } from "../../src/services/seed.js";

const REGISTRY_ROOT = join(process.env.HOME ?? "/tmp", ".tonquant", "registry");
const INDEX_PATH = join(REGISTRY_ROOT, "factors.json");
const EVENT_LOG_PATH = join(process.env.HOME ?? "/tmp", ".tonquant", "test-seed-events.jsonl");
const EVENT_LOG_LOCK_PATH = `${EVENT_LOG_PATH}.lock`;

describe("seed service", () => {
  beforeEach(() => {
    // Clean registry index to start fresh
    if (existsSync(INDEX_PATH)) rmSync(INDEX_PATH);
    if (existsSync(EVENT_LOG_PATH)) rmSync(EVENT_LOG_PATH);
    if (existsSync(EVENT_LOG_LOCK_PATH)) rmSync(EVENT_LOG_LOCK_PATH);
    process.env.TONQUANT_EVENT_LOG_PATH = EVENT_LOG_PATH;
  });

  afterEach(() => {
    if (existsSync(EVENT_LOG_PATH)) rmSync(EVENT_LOG_PATH);
    if (existsSync(EVENT_LOG_LOCK_PATH)) rmSync(EVENT_LOG_LOCK_PATH);
    delete process.env.TONQUANT_EVENT_LOG_PATH;
  });

  it("publishes all seed factors to empty registry", () => {
    const count = seedRegistry();
    expect(count).toBe(SEED_FACTORS.length);
    const factors = listFactors();
    expect(factors.length).toBe(SEED_FACTORS.length);
  });

  it("skips existing factors without force", () => {
    seedRegistry();
    const count = seedRegistry();
    expect(count).toBe(0);
  });

  it("overwrites with force", () => {
    seedRegistry();
    const count = seedRegistry({ force: true });
    expect(count).toBe(SEED_FACTORS.length);
  });

  it("seed factors cover all categories", () => {
    seedRegistry();
    const factors = listFactors();
    const categories = new Set(factors.map((f) => f.category));
    expect(categories.has("momentum")).toBe(true);
    expect(categories.has("value")).toBe(true);
    expect(categories.has("volatility")).toBe(true);
    expect(categories.has("liquidity")).toBe(true);
    expect(categories.has("sentiment")).toBe(true);
    expect(categories.has("custom")).toBe(true);
  });

  it("all seed factors have valid backtest data", () => {
    for (const f of SEED_FACTORS) {
      expect(f.listingType).toBe("legacy-signal");
      expect(f.referenceBacktest?.strategyMetrics.sharpe ?? 0).toBeGreaterThan(0);
      expect(f.referenceBacktest?.strategyMetrics.maxDrawdown ?? 0).toBeGreaterThan(0);
      expect(f.referenceBacktest?.strategyMetrics.winRate ?? 0).toBeGreaterThan(0);
      expect(f.referenceBacktest?.strategyMetrics.winRate ?? 0).toBeLessThanOrEqual(1);
    }
  });
});

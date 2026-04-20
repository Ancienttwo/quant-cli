import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readEvents } from "../../src/services/event-log.js";
import {
  DuplicateFactorError,
  discoverFactors,
  FactorListingRequiredError,
  FactorNotFoundError,
  getFactorDecayView,
  getFactorDetail,
  getFactorIcView,
  getFactorLeaderboard,
  getFactorUniquenessView,
  listFactors,
  publishFactor,
  subscribeFactor,
  unsubscribeFactor,
} from "../../src/services/registry.js";
import { makeFactor, makeLegacySignal } from "../helpers/factor-fixtures.js";

const REGISTRY_ROOT = join(process.env.HOME ?? "/tmp", ".tonquant", "registry");
const INDEX_PATH = join(REGISTRY_ROOT, "factors.json");
const SUBS_PATH = join(process.env.HOME ?? "/tmp", ".tonquant", "subscriptions.json");
const EVENT_LOG_PATH = join(process.env.HOME ?? "/tmp", ".tonquant", "test-registry-events.jsonl");
const EVENT_LOG_LOCK_PATH = `${EVENT_LOG_PATH}.lock`;

function resetEventLogEnv(): void {
  process.env.TONQUANT_EVENT_LOG_PATH = EVENT_LOG_PATH;
  delete process.env.TONQUANT_EVENT_LOG_FAIL_APPEND;
}

function clearEventArtifacts(): void {
  if (existsSync(EVENT_LOG_PATH)) rmSync(EVENT_LOG_PATH);
  if (existsSync(EVENT_LOG_LOCK_PATH)) rmSync(EVENT_LOG_LOCK_PATH);
}

beforeEach(() => {
  resetEventLogEnv();
  clearEventArtifacts();
});

afterEach(() => {
  clearEventArtifacts();
  delete process.env.TONQUANT_EVENT_LOG_PATH;
  delete process.env.TONQUANT_EVENT_LOG_FAIL_APPEND;
});

// ============================================================
// Service Tests
// ============================================================

describe("registry service — publishFactor", () => {
  beforeEach(() => {
    if (existsSync(INDEX_PATH)) rmSync(INDEX_PATH);
  });

  it("publishes to empty registry and returns validated meta", () => {
    const result = publishFactor(makeFactor("pub_test_aaa"));
    expect(result.id).toBe("pub_test_aaa");
    expect(result.name).toBe("Factor pub_test_aaa");
    const all = listFactors();
    expect(all.some((f) => f.id === "pub_test_aaa")).toBe(true);
  });

  it("appends an audit event on publish", () => {
    publishFactor(makeFactor("pub_event_test"));

    const events = readEvents({ type: "factor.publish" });
    expect(events.length).toBe(1);
    expect(events[0]?.entity.id).toBe("pub_event_test");
  });

  it("throws DuplicateFactorError without --force", () => {
    publishFactor(makeFactor("pub_dup_test"));
    expect(() => publishFactor(makeFactor("pub_dup_test"))).toThrow(DuplicateFactorError);
  });

  it("overwrites with force", () => {
    publishFactor(makeFactor("pub_force_tst", { description: "v1" }));
    const updated = publishFactor(makeFactor("pub_force_tst", { description: "v2" }), {
      force: true,
    });
    expect(updated.description).toBe("v2");
  });

  it("rolls back factor state when event append fails", () => {
    process.env.TONQUANT_EVENT_LOG_FAIL_APPEND = "1";

    expect(() => publishFactor(makeFactor("pub_rollback_test"))).toThrow(
      "Injected event log append failure.",
    );
    expect(listFactors().some((factor) => factor.id === "pub_rollback_test")).toBe(false);
    expect(readEvents()).toEqual([]);
  });
});

describe("registry service — discoverFactors", () => {
  beforeEach(() => {
    if (existsSync(INDEX_PATH)) rmSync(INDEX_PATH);
    publishFactor(
      makeFactor("disc_mom_ton", {
        category: "momentum",
        definition: {
          ...makeFactor("disc_mom_ton").definition,
          assets: ["TON"],
          universe: {
            ...makeFactor("disc_mom_ton").definition.universe,
            assets: ["TON"],
          },
          timeframe: "1d",
        },
        metrics: {
          ...makeFactor("disc_mom_ton").metrics,
          factorQuality: {
            ...makeFactor("disc_mom_ton").metrics.factorQuality,
            rankIcOosIcir: 2,
          },
        },
      }),
    );
    publishFactor(
      makeFactor("disc_vol_not", {
        category: "volatility",
        definition: {
          ...makeFactor("disc_vol_not").definition,
          assets: ["NOT"],
          universe: {
            ...makeFactor("disc_vol_not").definition.universe,
            assets: ["NOT"],
          },
          timeframe: "4h",
        },
        metrics: {
          ...makeFactor("disc_vol_not").metrics,
          factorQuality: {
            ...makeFactor("disc_vol_not").metrics.factorQuality,
            rankIcOosIcir: 0.8,
          },
        },
      }),
    );
    publishFactor(
      makeFactor("disc_val_ton", {
        category: "value",
        definition: {
          ...makeFactor("disc_val_ton").definition,
          assets: ["TON", "NOT"],
          universe: {
            ...makeFactor("disc_val_ton").definition.universe,
            assets: ["TON", "NOT"],
          },
          timeframe: "1d",
        },
        metrics: {
          ...makeFactor("disc_val_ton").metrics,
          factorQuality: {
            ...makeFactor("disc_val_ton").metrics.factorQuality,
            rankIcOosIcir: 1.2,
          },
        },
      }),
    );
  });

  it("filters by category", () => {
    const results = discoverFactors({ category: "momentum" });
    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe("disc_mom_ton");
  });

  it("filters by asset (case insensitive)", () => {
    const results = discoverFactors({ asset: "not" });
    expect(results.length).toBe(2);
    expect(
      results.every((f) =>
        f.definition.universe.assets.some((a: string) => a.toUpperCase() === "NOT"),
      ),
    ).toBe(true);
  });

  it("filters by minRankIcOosIcir", () => {
    const results = discoverFactors({ minRankIcOosIcir: 1.0 });
    expect(results.length).toBe(2);
    expect(results.every((f) => f.metrics.factorQuality.rankIcOosIcir >= 1.0)).toBe(true);
  });

  it("filters by timeframe", () => {
    const results = discoverFactors({ timeframe: "4h" });
    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe("disc_vol_not");
  });

  it("returns empty for non-matching combined filters", () => {
    const results = discoverFactors({ category: "sentiment" });
    expect(results.length).toBe(0);
  });
});

describe("registry service — subscribeFactor", () => {
  beforeEach(() => {
    if (existsSync(INDEX_PATH)) rmSync(INDEX_PATH);
    if (existsSync(SUBS_PATH)) rmSync(SUBS_PATH);
    publishFactor(makeFactor("sub_test_fac"));
    clearEventArtifacts();
  });

  afterEach(() => {
    if (existsSync(SUBS_PATH)) rmSync(SUBS_PATH);
  });

  it("subscribes to existing factor", () => {
    const sub = subscribeFactor("sub_test_fac");
    expect(sub.factorId).toBe("sub_test_fac");
    expect(sub.subscribedVersion).toBe("1.0.0");
  });

  it("idempotent re-subscribe returns same result", () => {
    const first = subscribeFactor("sub_test_fac");
    const second = subscribeFactor("sub_test_fac");
    expect(second.factorId).toBe(first.factorId);
    expect(second.subscribedAt).toBe(first.subscribedAt);
  });

  it("does not append a new event for idempotent re-subscribe", () => {
    subscribeFactor("sub_test_fac");
    clearEventArtifacts();

    subscribeFactor("sub_test_fac");

    expect(readEvents()).toEqual([]);
  });

  it("appends an audit event when a subscription is created", () => {
    subscribeFactor("sub_test_fac");

    const events = readEvents({ type: "factor.subscribe" });
    expect(events.length).toBe(1);
    expect(events[0]?.entity.id).toBe("sub_test_fac");
  });

  it("rolls back subscriptions when event append fails", () => {
    process.env.TONQUANT_EVENT_LOG_FAIL_APPEND = "1";

    expect(() => subscribeFactor("sub_test_fac")).toThrow("Injected event log append failure.");
    expect(listFactors({ subscribedOnly: true })).toEqual([]);
    expect(readEvents()).toEqual([]);
  });

  it("throws FactorNotFoundError for unknown factor", () => {
    expect(() => subscribeFactor("nonexistent_xyz")).toThrow(FactorNotFoundError);
  });
});

describe("registry service — unsubscribeFactor", () => {
  beforeEach(() => {
    if (existsSync(INDEX_PATH)) rmSync(INDEX_PATH);
    if (existsSync(SUBS_PATH)) rmSync(SUBS_PATH);
    publishFactor(makeFactor("unsub_test_f"));
    clearEventArtifacts();
    subscribeFactor("unsub_test_f");
    clearEventArtifacts();
  });

  afterEach(() => {
    if (existsSync(SUBS_PATH)) rmSync(SUBS_PATH);
  });

  it("unsubscribes and returns true", () => {
    expect(unsubscribeFactor("unsub_test_f")).toBe(true);
  });

  it("appends an audit event when unsubscribing", () => {
    unsubscribeFactor("unsub_test_f");

    const events = readEvents({ type: "factor.unsubscribe" });
    expect(events.length).toBe(1);
    expect(events[0]?.entity.id).toBe("unsub_test_f");
  });

  it("rolls back unsubscription when event append fails", () => {
    process.env.TONQUANT_EVENT_LOG_FAIL_APPEND = "1";

    expect(() => unsubscribeFactor("unsub_test_f")).toThrow("Injected event log append failure.");
    expect(listFactors({ subscribedOnly: true }).map((factor) => factor.id)).toEqual([
      "unsub_test_f",
    ]);
    expect(readEvents()).toHaveLength(0);
  });

  it("returns false for unknown factorId", () => {
    expect(unsubscribeFactor("no_such_sub")).toBe(false);
  });

  it("does not append an event for no-op unsubscribe", () => {
    expect(unsubscribeFactor("no_such_sub")).toBe(false);
    expect(readEvents()).toEqual([]);
  });
});

describe("registry service — listFactors", () => {
  beforeEach(() => {
    if (existsSync(INDEX_PATH)) rmSync(INDEX_PATH);
    if (existsSync(SUBS_PATH)) rmSync(SUBS_PATH);
    publishFactor(makeFactor("list_fac_aaa"));
    publishFactor(makeFactor("list_fac_bbb"));
    subscribeFactor("list_fac_aaa");
  });

  afterEach(() => {
    if (existsSync(SUBS_PATH)) rmSync(SUBS_PATH);
  });

  it("filters subscribedOnly", () => {
    const subscribed = listFactors({ subscribedOnly: true });
    expect(subscribed.length).toBe(1);
    expect(subscribed[0]?.id).toBe("list_fac_aaa");
  });
});

describe("registry service — getFactorDetail", () => {
  beforeEach(() => {
    if (existsSync(INDEX_PATH)) rmSync(INDEX_PATH);
    publishFactor(makeFactor("detail_test"), {
      privateData: { parameterValues: { window: 30 }, universeRules: [] },
    });
  });

  it("returns full entry with private data", () => {
    const entry = getFactorDetail("detail_test");
    expect(entry.public.id).toBe("detail_test");
    expect(entry.private?.parameterValues.window).toBe(30);
  });

  it("throws FactorNotFoundError for unknown", () => {
    expect(() => getFactorDetail("no_such_entry")).toThrow(FactorNotFoundError);
  });
});

describe("registry service — factor read models", () => {
  beforeEach(() => {
    if (existsSync(INDEX_PATH)) rmSync(INDEX_PATH);
    publishFactor(makeFactor("view_test_factor"));
    publishFactor(makeLegacySignal("view_test_signal"));
  });

  it("returns IC summary for factor listings", () => {
    const view = getFactorIcView("view_test_factor");
    expect(view.factorId).toBe("view_test_factor");
    expect(view.rankIcOosIcir).toBeGreaterThan(0);
    expect(view.sampleCount).toBeGreaterThan(0);
  });

  it("returns decay summary for factor listings", () => {
    const view = getFactorDecayView("view_test_factor");
    expect(view.decay.length).toBeGreaterThan(0);
    expect(view.evaluationFrequency).toBe("daily");
  });

  it("returns uniqueness summary for factor listings", () => {
    const view = getFactorUniquenessView("view_test_factor");
    expect(view.peerCorrelation.bucket).toBe("unique");
    expect(view.turnoverTwoWay).toBeGreaterThan(0);
  });

  it("rejects legacy signal entries for factor-native read models", () => {
    expect(() => getFactorIcView("view_test_signal")).toThrow(FactorListingRequiredError);
    expect(() => getFactorDecayView("view_test_signal")).toThrow(FactorListingRequiredError);
    expect(() => getFactorUniquenessView("view_test_signal")).toThrow(FactorListingRequiredError);
  });
});

describe("registry service — getFactorLeaderboard", () => {
  beforeEach(() => {
    if (existsSync(INDEX_PATH)) rmSync(INDEX_PATH);
    publishFactor(
      makeFactor("lb_low_sharp", {
        metrics: {
          ...makeFactor("lb_low_sharp").metrics,
          factorQuality: {
            ...makeFactor("lb_low_sharp").metrics.factorQuality,
            rankIcOosIcir: 0.5,
            rankIcOosMean: 0.01,
            quantileSpreadQ5Q1: 0.002,
          },
          implementationProfile: {
            ...makeFactor("lb_low_sharp").metrics.implementationProfile,
            turnoverTwoWay: 0.35,
            peerCorrelation: {
              ...makeFactor("lb_low_sharp").metrics.implementationProfile.peerCorrelation,
              maxAbs: 0.5,
            },
          },
        },
      }),
    );
    publishFactor(
      makeFactor("lb_mid_sharp", {
        metrics: {
          ...makeFactor("lb_mid_sharp").metrics,
          factorQuality: {
            ...makeFactor("lb_mid_sharp").metrics.factorQuality,
            rankIcOosIcir: 1.5,
            rankIcOosMean: 0.03,
            quantileSpreadQ5Q1: 0.01,
          },
          implementationProfile: {
            ...makeFactor("lb_mid_sharp").metrics.implementationProfile,
            turnoverTwoWay: 0.22,
            peerCorrelation: {
              ...makeFactor("lb_mid_sharp").metrics.implementationProfile.peerCorrelation,
              maxAbs: 0.4,
            },
          },
        },
      }),
    );
    publishFactor(
      makeFactor("lb_top_sharp", {
        metrics: {
          ...makeFactor("lb_top_sharp").metrics,
          factorQuality: {
            ...makeFactor("lb_top_sharp").metrics.factorQuality,
            rankIcOosIcir: 2.5,
            rankIcOosMean: 0.04,
            quantileSpreadQ5Q1: 0.015,
          },
          implementationProfile: {
            ...makeFactor("lb_top_sharp").metrics.implementationProfile,
            turnoverTwoWay: 0.18,
            peerCorrelation: {
              ...makeFactor("lb_top_sharp").metrics.implementationProfile.peerCorrelation,
              maxAbs: 0.25,
            },
          },
        },
      }),
    );
  });

  it("returns sorted by factor-native ranking", () => {
    const top = getFactorLeaderboard();
    expect(top[0]?.id).toBe("lb_top_sharp");
    expect(top[1]?.id).toBe("lb_mid_sharp");
    expect(top[2]?.id).toBe("lb_low_sharp");
  });

  it("respects limit parameter", () => {
    const top = getFactorLeaderboard({ limit: 2 });
    expect(top.length).toBe(2);
  });
});

describe("registry service — corrupted JSON", () => {
  it("throws descriptive error for corrupted factors.json", () => {
    mkdirSync(REGISTRY_ROOT, { recursive: true });
    writeFileSync(INDEX_PATH, "NOT VALID JSON{{{");
    expect(() => listFactors()).toThrow(/corrupted/iu);
    // Clean up
    rmSync(INDEX_PATH);
  });
});

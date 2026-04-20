import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  CompositeNotFoundError,
  CompositionValidationError,
  composeFactors,
  DuplicateCompositeError,
  deleteComposite,
  getComposite,
  listComposites,
  normalizeWeights,
  validateComponents,
} from "../../src/services/compose.js";
import { readEvents } from "../../src/services/event-log.js";
import { publishFactor } from "../../src/services/registry.js";
import {
  ComponentWeightSchema,
  CompositeDefinitionSchema,
} from "../../src/types/factor-compose.js";
import { makeFactor } from "../helpers/factor-fixtures.js";

const now = "2026-03-24T10:00:00Z";
const EVENT_LOG_PATH = join(process.env.HOME ?? "/tmp", ".tonquant", "test-compose-events.jsonl");
const EVENT_LOG_LOCK_PATH = `${EVENT_LOG_PATH}.lock`;

function resetEventLogEnv(): void {
  process.env.TONQUANT_EVENT_LOG_PATH = EVENT_LOG_PATH;
  delete process.env.TONQUANT_EVENT_LOG_FAIL_APPEND;
}

function clearEventArtifacts(): void {
  if (existsSync(EVENT_LOG_PATH)) {
    rmSync(EVENT_LOG_PATH);
  }
  if (existsSync(EVENT_LOG_LOCK_PATH)) {
    rmSync(EVENT_LOG_LOCK_PATH);
  }
}

// ============================================================
// Schema Tests
// ============================================================

describe("ComponentWeightSchema", () => {
  it("accepts valid weight", () => {
    const result = ComponentWeightSchema.parse({ factorId: "mom_30d", weight: 0.6 });
    expect(result.factorId).toBe("mom_30d");
    expect(result.weight).toBe(0.6);
  });

  it("accepts negative weight for hedging", () => {
    const result = ComponentWeightSchema.parse({ factorId: "vol_7d", weight: -0.3 });
    expect(result.weight).toBe(-0.3);
  });

  it("rejects weight > 1", () => {
    expect(() => ComponentWeightSchema.parse({ factorId: "mom_30d", weight: 1.5 })).toThrow();
  });

  it("rejects weight < -1", () => {
    expect(() => ComponentWeightSchema.parse({ factorId: "mom_30d", weight: -1.5 })).toThrow();
  });

  it("rejects invalid factor ID", () => {
    expect(() => ComponentWeightSchema.parse({ factorId: "AB", weight: 0.5 })).toThrow();
  });
});

describe("CompositeDefinitionSchema", () => {
  it("requires minimum 2 components", () => {
    expect(() =>
      CompositeDefinitionSchema.parse({
        id: "blend_one",
        name: "Single",
        description: "Just one",
        components: [{ factorId: "mom_30d", weight: 1.0 }],
        createdAt: now,
        updatedAt: now,
      }),
    ).toThrow();
  });

  it("defaults normalizeWeights to true", () => {
    const result = CompositeDefinitionSchema.parse({
      id: "mom_vol_blend",
      name: "Blend",
      description: "Test blend",
      components: [
        { factorId: "mom_30d", weight: 0.6 },
        { factorId: "vol_7d", weight: 0.4 },
      ],
      createdAt: now,
      updatedAt: now,
    });
    expect(result.normalizeWeights).toBe(true);
  });

  it("validates composite ID format", () => {
    expect(() =>
      CompositeDefinitionSchema.parse({
        id: "AB",
        name: "Bad",
        description: "Bad ID",
        components: [
          { factorId: "mom_30d", weight: 0.5 },
          { factorId: "vol_7d", weight: 0.5 },
        ],
        createdAt: now,
        updatedAt: now,
      }),
    ).toThrow();
  });
});

// ============================================================
// Pure Function Tests
// ============================================================

describe("normalizeWeights", () => {
  it("returns same weights when already normalized", () => {
    const input = [
      { factorId: "aaa", weight: 0.6 },
      { factorId: "bbb", weight: 0.4 },
    ];
    const result = normalizeWeights(input);
    expect(result[0]?.weight).toBeCloseTo(0.6);
    expect(result[1]?.weight).toBeCloseTo(0.4);
  });

  it("normalizes unequal weights", () => {
    const input = [
      { factorId: "aaa", weight: 0.9 },
      { factorId: "bbb", weight: 0.3 },
    ];
    const result = normalizeWeights(input);
    // abs sum = 1.2, so 0.9/1.2=0.75, 0.3/1.2=0.25
    expect(result[0]?.weight).toBeCloseTo(0.75);
    expect(result[1]?.weight).toBeCloseTo(0.25);
  });

  it("preserves sign for negative weights", () => {
    const input = [
      { factorId: "aaa", weight: 0.8 },
      { factorId: "bbb", weight: -0.2 },
    ];
    const result = normalizeWeights(input);
    // abs sum = 1.0, already normalized
    expect(result[0]?.weight).toBeCloseTo(0.8);
    expect(result[1]?.weight).toBeCloseTo(-0.2);
  });

  it("throws on all-zero weights", () => {
    const input = [
      { factorId: "aaa", weight: 0 },
      { factorId: "bbb", weight: 0 },
    ];
    expect(() => normalizeWeights(input)).toThrow(CompositionValidationError);
  });

  it("does not mutate input array", () => {
    const input = [
      { factorId: "aaa", weight: 0.9 },
      { factorId: "bbb", weight: 0.3 },
    ];
    const originalWeight = input[0]?.weight;
    normalizeWeights(input);
    expect(input[0]?.weight).toBe(originalWeight);
  });
});

describe("validateComponents", () => {
  const factors = [makeFactor("mom_30d"), makeFactor("vol_7d")];

  it("passes when all components exist", () => {
    const result = validateComponents(
      [
        { factorId: "mom_30d", weight: 0.5 },
        { factorId: "vol_7d", weight: 0.5 },
      ],
      factors,
    );
    expect(result).toEqual({ valid: true });
  });

  it("reports missing factors", () => {
    const result = validateComponents(
      [
        { factorId: "mom_30d", weight: 0.5 },
        { factorId: "nonexistent", weight: 0.5 },
      ],
      factors,
    );
    expect(result).toEqual({ valid: false, missing: ["nonexistent"] });
  });
});

// ============================================================
// Integration Tests (with filesystem)
// ============================================================

describe("compose service integration", () => {
  const TEST_REGISTRY_ROOT = join(process.env.HOME ?? "/tmp", ".tonquant", "registry");
  const TEST_COMPOSITES = join(TEST_REGISTRY_ROOT, "composites.json");

  // Seed two factors before each test
  beforeEach(() => {
    resetEventLogEnv();
    clearEventArtifacts();
    // Clean composites file
    if (existsSync(TEST_COMPOSITES)) {
      rmSync(TEST_COMPOSITES);
    }

    // Publish test factors
    publishFactor(makeFactor("alpha_mom"), { force: true });
    publishFactor(
      makeFactor("beta_vol", {
        category: "volatility",
        metrics: {
          ...makeFactor("beta_vol").metrics,
          factorQuality: {
            ...makeFactor("beta_vol").metrics.factorQuality,
            rankIcOosIcir: 0.9,
          },
        },
      }),
      { force: true },
    );
    clearEventArtifacts();
  });

  afterEach(() => {
    if (existsSync(TEST_COMPOSITES)) {
      rmSync(TEST_COMPOSITES);
    }
    clearEventArtifacts();
    delete process.env.TONQUANT_EVENT_LOG_PATH;
    delete process.env.TONQUANT_EVENT_LOG_FAIL_APPEND;
  });

  it("composes two factors successfully", () => {
    const entry = composeFactors({
      id: "mom_vol_blend",
      name: "Momentum-Volatility Blend",
      description: "60% momentum, 40% volatility",
      components: [
        { factorId: "alpha_mom", weight: 0.6 },
        { factorId: "beta_vol", weight: 0.4 },
      ],
      normalizeWeights: true,
      createdAt: now,
      updatedAt: now,
    });

    expect(entry.definition.id).toBe("mom_vol_blend");
    expect(entry.definition.components).toHaveLength(2);
  });

  it("appends an audit event when saving a composite", () => {
    composeFactors({
      id: "event_blend",
      name: "Event",
      description: "Event test",
      components: [
        { factorId: "alpha_mom", weight: 0.5 },
        { factorId: "beta_vol", weight: 0.5 },
      ],
      normalizeWeights: true,
      createdAt: now,
      updatedAt: now,
    });

    const events = readEvents({ type: "factor.compose.save" });
    expect(events.length).toBe(1);
    expect(events[0]?.entity.id).toBe("event_blend");
  });

  it("rolls back composite saves when event append fails", () => {
    process.env.TONQUANT_EVENT_LOG_FAIL_APPEND = "1";

    expect(() =>
      composeFactors({
        id: "rollback_blend",
        name: "Rollback",
        description: "Rollback test",
        components: [
          { factorId: "alpha_mom", weight: 0.5 },
          { factorId: "beta_vol", weight: 0.5 },
        ],
        normalizeWeights: true,
        createdAt: now,
        updatedAt: now,
      }),
    ).toThrow("Injected event log append failure.");
    expect(listComposites()).toEqual([]);
    expect(readEvents()).toEqual([]);
  });

  it("rejects self-referencing composite", () => {
    expect(() =>
      composeFactors({
        id: "alpha_mom",
        name: "Self Ref",
        description: "References itself",
        components: [
          { factorId: "alpha_mom", weight: 0.5 },
          { factorId: "beta_vol", weight: 0.5 },
        ],
        normalizeWeights: true,
        createdAt: now,
        updatedAt: now,
      }),
    ).toThrow(CompositionValidationError);
  });

  it("throws for missing component factor", () => {
    expect(() =>
      composeFactors({
        id: "bad_blend",
        name: "Bad Blend",
        description: "References missing factor",
        components: [
          { factorId: "alpha_mom", weight: 0.5 },
          { factorId: "nonexistent", weight: 0.5 },
        ],
        normalizeWeights: true,
        createdAt: now,
        updatedAt: now,
      }),
    ).toThrow(CompositionValidationError);
  });

  it("rejects duplicate composite without force", () => {
    const def = {
      id: "dup_blend",
      name: "Dup",
      description: "Duplicate test",
      components: [
        { factorId: "alpha_mom", weight: 0.5 },
        { factorId: "beta_vol", weight: 0.5 },
      ],
      normalizeWeights: true,
      createdAt: now,
      updatedAt: now,
    };
    composeFactors(def);
    expect(() => composeFactors(def)).toThrow(DuplicateCompositeError);
  });

  it("allows overwrite with force", () => {
    const def = {
      id: "force_blend",
      name: "Force",
      description: "Force overwrite test",
      components: [
        { factorId: "alpha_mom", weight: 0.5 },
        { factorId: "beta_vol", weight: 0.5 },
      ],
      normalizeWeights: true,
      createdAt: now,
      updatedAt: now,
    };
    composeFactors(def);
    const updated = composeFactors(def, { force: true });
    expect(updated.definition.id).toBe("force_blend");
  });

  it("lists all saved composites", () => {
    composeFactors({
      id: "list_blend_a",
      name: "A",
      description: "First",
      components: [
        { factorId: "alpha_mom", weight: 0.5 },
        { factorId: "beta_vol", weight: 0.5 },
      ],
      normalizeWeights: true,
      createdAt: now,
      updatedAt: now,
    });
    composeFactors({
      id: "list_blend_b",
      name: "B",
      description: "Second",
      components: [
        { factorId: "alpha_mom", weight: 0.7 },
        { factorId: "beta_vol", weight: 0.3 },
      ],
      normalizeWeights: true,
      createdAt: now,
      updatedAt: now,
    });

    const all = listComposites();
    expect(all.length).toBe(2);
  });

  it("gets composite by ID", () => {
    composeFactors({
      id: "get_blend",
      name: "Get",
      description: "Get test",
      components: [
        { factorId: "alpha_mom", weight: 0.5 },
        { factorId: "beta_vol", weight: 0.5 },
      ],
      normalizeWeights: true,
      createdAt: now,
      updatedAt: now,
    });

    const entry = getComposite("get_blend");
    expect(entry.definition.name).toBe("Get");
  });

  it("throws for unknown composite ID", () => {
    expect(() => getComposite("nonexistent")).toThrow(CompositeNotFoundError);
  });

  it("deletes composite", () => {
    composeFactors({
      id: "del_blend",
      name: "Del",
      description: "Delete test",
      components: [
        { factorId: "alpha_mom", weight: 0.5 },
        { factorId: "beta_vol", weight: 0.5 },
      ],
      normalizeWeights: true,
      createdAt: now,
      updatedAt: now,
    });

    expect(deleteComposite("del_blend")).toBe(true);
    expect(deleteComposite("del_blend")).toBe(false);
    expect(listComposites().length).toBe(0);
  });

  it("does not append an event for no-op composite deletion", () => {
    expect(deleteComposite("missing_blend")).toBe(false);
    expect(readEvents()).toEqual([]);
  });

  it("appends an audit event when deleting a composite", () => {
    composeFactors({
      id: "del_event_blend",
      name: "Delete Event",
      description: "Delete event test",
      components: [
        { factorId: "alpha_mom", weight: 0.5 },
        { factorId: "beta_vol", weight: 0.5 },
      ],
      normalizeWeights: true,
      createdAt: now,
      updatedAt: now,
    });
    clearEventArtifacts();

    deleteComposite("del_event_blend");

    const events = readEvents({ type: "factor.compose.delete" });
    expect(events.length).toBe(1);
    expect(events[0]?.entity.id).toBe("del_event_blend");
  });

  it("rolls back composite deletion when event append fails", () => {
    composeFactors({
      id: "del_rollback_blend",
      name: "Delete Rollback",
      description: "Delete rollback test",
      components: [
        { factorId: "alpha_mom", weight: 0.5 },
        { factorId: "beta_vol", weight: 0.5 },
      ],
      normalizeWeights: true,
      createdAt: now,
      updatedAt: now,
    });
    clearEventArtifacts();
    process.env.TONQUANT_EVENT_LOG_FAIL_APPEND = "1";

    expect(() => deleteComposite("del_rollback_blend")).toThrow(
      "Injected event log append failure.",
    );
    expect(listComposites().map((entry) => entry.definition.id)).toEqual(["del_rollback_blend"]);
    expect(readEvents()).toEqual([]);
  });
});

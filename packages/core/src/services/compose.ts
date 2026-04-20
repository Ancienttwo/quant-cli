import { join } from "node:path";
import { ServiceError } from "../errors.js";
import { CONFIG_DIR } from "../types/config.js";
import {
  type ComponentWeight,
  type CompositeDefinition,
  CompositeDefinitionSchema,
  type CompositeEntry,
  type CompositeIndex,
  CompositeIndexSchema,
} from "../types/factor-compose.js";
import type { FactorMetaPublic, LegacySignalMetaPublic } from "../types/factor-registry.js";
import { readJsonFile, writeJsonFileAtomic } from "../utils/file-store.js";
import { mutateWithEvent } from "./event-log.js";
import { listFactors } from "./registry.js";

// ── Paths ──────────────────────────────────────────────────
const REGISTRY_ROOT = join(CONFIG_DIR, "registry");
export const COMPOSITES_PATH = join(REGISTRY_ROOT, "composites.json");

// ── Error subclasses ───────────────────────────────────────
export class CompositionValidationError extends ServiceError {
  constructor(message: string) {
    super(message, "COMPOSITION_VALIDATION");
    this.name = "CompositionValidationError";
  }
}

export class DuplicateCompositeError extends ServiceError {
  constructor(id: string) {
    super(`Composite '${id}' already exists. Use --force to update.`, "DUPLICATE_COMPOSITE");
    this.name = "DuplicateCompositeError";
  }
}

export class CompositeNotFoundError extends ServiceError {
  constructor(id: string) {
    super(`Composite '${id}' not found.`, "COMPOSITE_NOT_FOUND");
    this.name = "CompositeNotFoundError";
  }
}

// ── Pure functions ─────────────────────────────────────────

/**
 * Normalize weights so sum of absolute values = 1.0.
 * Preserves sign. Returns new array (immutable).
 */
export function normalizeWeights(components: ReadonlyArray<ComponentWeight>): ComponentWeight[] {
  const absSum = components.reduce((sum, c) => sum + Math.abs(c.weight), 0);
  if (absSum === 0) {
    throw new CompositionValidationError("All component weights are zero.");
  }
  return components.map((c) => ({
    factorId: c.factorId,
    weight: c.weight / absSum,
  }));
}

/**
 * Validate that all component factor IDs exist in the available factors list.
 */
export function validateComponents(
  components: ReadonlyArray<ComponentWeight>,
  availableFactors: ReadonlyArray<FactorMetaPublic | LegacySignalMetaPublic>,
): { valid: true } | { valid: false; missing: string[] } {
  const available = new Set(availableFactors.map((f) => f.id));
  const missing = components.filter((c) => !available.has(c.factorId)).map((c) => c.factorId);
  if (missing.length > 0) return { valid: false, missing };
  return { valid: true };
}

// ── IO helpers ─────────────────────────────────────────────

function readCompositeIndex(): CompositeIndex {
  return readJsonFile<CompositeIndex>(COMPOSITES_PATH, CompositeIndexSchema, {
    defaultValue: { version: "1.0.0", composites: [] },
    corruptedCode: "COMPOSITION_VALIDATION",
    corruptedMessage: `composites.json is corrupted. Delete ${COMPOSITES_PATH} to reset.`,
  });
}

function writeCompositeIndex(index: CompositeIndex): void {
  writeJsonFileAtomic(COMPOSITES_PATH, index);
}

// ── Public API ─────────────────────────────────────────────

export interface ComposeOptions {
  force?: boolean;
}

export function composeFactors(
  definition: CompositeDefinition,
  opts: ComposeOptions = {},
): CompositeEntry {
  // 1. Validate definition schema
  const validated = CompositeDefinitionSchema.parse(definition);

  // 2. Guard against self-reference
  if (validated.components.some((c) => c.factorId === validated.id)) {
    throw new CompositionValidationError(
      `Composite '${validated.id}' cannot reference itself as a component.`,
    );
  }

  return mutateWithEvent({
    paths: [COMPOSITES_PATH],
    event: (entry) => ({
      type: "factor.compose.save",
      entity: { kind: "composite", id: validated.id },
      result: "success",
      summary: opts.force
        ? `Updated composite ${validated.id}.`
        : `Saved composite ${validated.id}.`,
      payload: {
        componentCount: entry.definition.components.length,
        normalized: entry.definition.normalizeWeights,
        force: Boolean(opts.force),
      },
    }),
    apply: () => {
      const allFactors = listFactors();
      const validation = validateComponents(validated.components, allFactors);
      if (!validation.valid) {
        throw new CompositionValidationError(`Missing factors: ${validation.missing.join(", ")}`);
      }

      const compositeIndex = readCompositeIndex();
      const existingIdx = compositeIndex.composites.findIndex(
        (c) => c.definition.id === validated.id,
      );
      if (existingIdx >= 0 && !opts.force) {
        throw new DuplicateCompositeError(validated.id);
      }

      const finalComponents = validated.normalizeWeights
        ? normalizeWeights(validated.components)
        : validated.components;

      const entry: CompositeEntry = {
        definition: { ...validated, components: finalComponents },
      };

      const updatedComposites =
        existingIdx >= 0
          ? compositeIndex.composites.map((composite, i) => (i === existingIdx ? entry : composite))
          : [...compositeIndex.composites, entry];

      writeCompositeIndex({ ...compositeIndex, composites: updatedComposites });
      return entry;
    },
  });
}

export function listComposites(): CompositeEntry[] {
  return readCompositeIndex().composites;
}

export function getComposite(compositeId: string): CompositeEntry {
  const index = readCompositeIndex();
  const entry = index.composites.find((c) => c.definition.id === compositeId);
  if (!entry) throw new CompositeNotFoundError(compositeId);
  return entry;
}

export function deleteComposite(compositeId: string): boolean {
  return mutateWithEvent({
    paths: [COMPOSITES_PATH],
    event: (deleted) =>
      deleted
        ? {
            type: "factor.compose.delete",
            entity: { kind: "composite", id: compositeId },
            result: "success",
            summary: `Deleted composite ${compositeId}.`,
          }
        : null,
    apply: () => {
      const index = readCompositeIndex();
      const filtered = index.composites.filter((c) => c.definition.id !== compositeId);
      if (filtered.length === index.composites.length) {
        return false;
      }
      writeCompositeIndex({ ...index, composites: filtered });
      return true;
    },
  });
}

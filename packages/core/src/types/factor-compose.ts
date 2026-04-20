import { z } from "zod";
import { FactorIdSchema } from "./factor-registry.js";

// ============================================================
// Factor Composition Schemas
// Defines weighted combinations of existing registry factors.
// Composite factors blend multiple signals into a single score.
// ============================================================

// ── Component weight ─────────────────────────────────────────
export const ComponentWeightSchema = z.object({
  factorId: FactorIdSchema,
  weight: z.number().min(-1).max(1),
});
export type ComponentWeight = z.infer<typeof ComponentWeightSchema>;

// ── Composite definition (the recipe) ────────────────────────
export const CompositeDefinitionSchema = z.object({
  id: FactorIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  components: z.array(ComponentWeightSchema).min(2),
  normalizeWeights: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CompositeDefinition = z.infer<typeof CompositeDefinitionSchema>;

// ── Stored composite recipe ──────────────────────────────────
export const CompositeEntrySchema = z.object({
  definition: CompositeDefinitionSchema,
});
export type CompositeEntry = z.infer<typeof CompositeEntrySchema>;

// ── Index of all saved compositions ──────────────────────────
export const CompositeIndexSchema = z.object({
  version: z.string().default("1.0.0"),
  composites: z.array(CompositeEntrySchema).default([]),
});
export type CompositeIndex = z.infer<typeof CompositeIndexSchema>;

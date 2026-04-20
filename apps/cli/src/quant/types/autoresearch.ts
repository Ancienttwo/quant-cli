import { z } from "zod";
import { BacktestCostConfigSchema } from "./backtest.js";
import {
  ArtifactRefSchema,
  AssetClassSchema,
  DataModeSchema,
  DateStringSchema,
  InstrumentRefSchema,
  MarketRegionSchema,
  ProviderCodeSchema,
  QuantParamValueSchema,
  QuantRunMetaSchema,
  QuantRunStatusSchema,
  VenueCodeSchema,
} from "./base.js";
import { StrategyParameterRangeSchema } from "./preset.js";

const FilesystemSafeIdSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/u,
    "Expected a filesystem-safe identifier (letters, digits, hyphen, underscore).",
  );

export const AcceptanceGatesSchema = z.object({
  minTradeCount: z.number().int().nonnegative().default(1),
  minSharpe: z.number().default(0),
  maxDrawdown: z.number().nonnegative().default(1),
  minWinRate: z.number().min(0).max(1).default(0),
  regressionThresholdPct: z.number().min(0).default(0.1),
});
export type AcceptanceGates = z.infer<typeof AcceptanceGatesSchema>;

export const QuantMetricSnapshotSchema = z.object({
  sharpe: z.number().nullable().optional(),
  totalReturn: z.number().nullable().optional(),
  maxDrawdown: z.number().nullable().optional(),
  winRate: z.number().nullable().optional(),
  tradeCount: z.number().int().nullable().optional(),
});
export type QuantMetricSnapshot = z.infer<typeof QuantMetricSnapshotSchema>;

export const QuantAutoresearchCandidateSchema = z.object({
  candidateId: FilesystemSafeIdSchema,
  status: z.enum(["pending-review", "kept", "discarded", "promoted", "rejected"]),
  strategy: z.string().min(1),
  params: z.record(z.string(), QuantParamValueSchema).default({}),
  metrics: QuantMetricSnapshotSchema.default({}),
  summary: z.string().nullable().optional(),
  artifacts: z.array(ArtifactRefSchema).default([]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type QuantAutoresearchCandidate = z.infer<typeof QuantAutoresearchCandidateSchema>;

export const QuantAutoresearchRunSummarySchema = z.object({
  runId: z.string().min(1),
  status: QuantRunStatusSchema,
  iterationsRequested: z.number().int().nonnegative(),
  iterationsCompleted: z.number().int().nonnegative(),
  keptCount: z.number().int().nonnegative().default(0),
  discardedCount: z.number().int().nonnegative().default(0),
  stopReason: z.string().nullable().optional(),
  startedAt: z.string().min(1),
  completedAt: z.string().nullable().optional(),
});
export type QuantAutoresearchRunSummary = z.infer<typeof QuantAutoresearchRunSummarySchema>;

export const QuantAutoresearchBaselineSpecSchema = z.object({
  trackId: FilesystemSafeIdSchema,
  title: z.string().min(1),
  thesis: z.string().nullable().optional(),
  strategy: z.string().min(1),
  params: z.record(z.string(), QuantParamValueSchema).default({}),
  paramRanges: z.record(z.string(), StrategyParameterRangeSchema).default({}),
  assetClass: AssetClassSchema.default("crypto"),
  marketRegion: MarketRegionSchema.default("ton"),
  venue: VenueCodeSchema.optional(),
  provider: ProviderCodeSchema.optional(),
  symbols: z.array(z.string().min(1)).min(1),
  instruments: z.array(InstrumentRefSchema).default([]),
  startDate: DateStringSchema,
  endDate: DateStringSchema,
  datasetPath: z.string().min(1).nullable().optional(),
  dataMode: DataModeSchema.default("cached"),
  costConfig: BacktestCostConfigSchema.nullable().optional(),
  acceptanceGates: AcceptanceGatesSchema.default({}),
  baselineRunId: z.string().nullable().optional(),
  baselineMetrics: QuantMetricSnapshotSchema.default({}),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type QuantAutoresearchBaselineSpec = z.infer<typeof QuantAutoresearchBaselineSpecSchema>;

export const QuantAutoresearchHistoryEntrySchema = z.object({
  timestamp: z.string().min(1),
  eventType: z.string().min(1),
  candidateId: z.string().nullable().optional(),
  runId: z.string().nullable().optional(),
  message: z.string().min(1),
});
export type QuantAutoresearchHistoryEntry = z.infer<typeof QuantAutoresearchHistoryEntrySchema>;

export const QuantAutoresearchStateSchema = z.object({
  trackId: FilesystemSafeIdSchema,
  title: z.string().min(1),
  status: z.enum(["idle", "running", "pending-review", "blocked"]),
  iterationBudget: z.number().int().positive().default(20),
  iterationsUsed: z.number().int().nonnegative().default(0),
  consecutiveNonImprovements: z.number().int().nonnegative().default(0),
  maxConsecutiveNonImprovements: z.number().int().positive().default(5),
  bestCandidateId: z.string().nullable().optional(),
  latestCandidateId: z.string().nullable().optional(),
  latestRun: QuantAutoresearchRunSummarySchema.nullable().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type QuantAutoresearchState = z.infer<typeof QuantAutoresearchStateSchema>;

export const QuantAutoresearchTrackSummarySchema = z.object({
  trackId: FilesystemSafeIdSchema,
  title: z.string().min(1),
  thesis: z.string().nullable().optional(),
  status: z.enum(["idle", "running", "pending-review", "blocked"]),
  assetClass: AssetClassSchema.default("crypto"),
  marketRegion: MarketRegionSchema.default("ton"),
  venue: VenueCodeSchema.optional(),
  updatedAt: z.string().min(1),
  candidateCount: z.number().int().nonnegative().default(0),
  keptCandidateCount: z.number().int().nonnegative().default(0),
  pendingPromotionCount: z.number().int().nonnegative().default(0),
});
export type QuantAutoresearchTrackSummary = z.infer<typeof QuantAutoresearchTrackSummarySchema>;

export const QuantAutoresearchTrackResultSchema = QuantRunMetaSchema.extend({
  baseline: QuantAutoresearchBaselineSpecSchema,
  state: QuantAutoresearchStateSchema,
  candidates: z.array(QuantAutoresearchCandidateSchema).default([]),
  history: z.array(QuantAutoresearchHistoryEntrySchema).default([]),
});
export type QuantAutoresearchTrackResult = z.infer<typeof QuantAutoresearchTrackResultSchema>;

export const QuantAutoresearchListRequestSchema = z.object({
  outputDir: z.string().min(1).optional(),
});
export type QuantAutoresearchListRequest = z.input<typeof QuantAutoresearchListRequestSchema>;

export const QuantAutoresearchListResultSchema = QuantRunMetaSchema.extend({
  tracks: z.array(QuantAutoresearchTrackSummarySchema).default([]),
});
export type QuantAutoresearchListResult = z.infer<typeof QuantAutoresearchListResultSchema>;

export const QuantAutoresearchInitRequestSchema = z.object({
  trackId: FilesystemSafeIdSchema.optional(),
  title: z.string().min(1),
  thesis: z.string().optional(),
  strategy: z.string().min(1),
  params: z.record(z.string(), QuantParamValueSchema).default({}),
  paramRanges: z.record(z.string(), StrategyParameterRangeSchema).default({}),
  assetClass: AssetClassSchema.default("crypto"),
  marketRegion: MarketRegionSchema.default("ton"),
  venue: VenueCodeSchema.optional(),
  provider: ProviderCodeSchema.optional(),
  symbols: z.array(z.string().min(1)).min(1),
  instruments: z.array(InstrumentRefSchema).optional(),
  startDate: DateStringSchema,
  endDate: DateStringSchema,
  datasetPath: z.string().min(1).optional(),
  dataMode: DataModeSchema.default("cached"),
  costConfig: BacktestCostConfigSchema.optional(),
  acceptanceGates: AcceptanceGatesSchema.default({}),
  outputDir: z.string().min(1).optional(),
});
export type QuantAutoresearchInitRequest = z.input<typeof QuantAutoresearchInitRequestSchema>;

export const QuantAutoresearchRunRequestSchema = z.object({
  trackId: FilesystemSafeIdSchema,
  iterations: z.number().int().positive().default(20),
  outputDir: z.string().min(1).optional(),
});
export type QuantAutoresearchRunRequest = z.input<typeof QuantAutoresearchRunRequestSchema>;

export const QuantAutoresearchStatusRequestSchema = z.object({
  trackId: FilesystemSafeIdSchema,
  outputDir: z.string().min(1).optional(),
});
export type QuantAutoresearchStatusRequest = z.input<typeof QuantAutoresearchStatusRequestSchema>;

export const QuantAutoresearchPromoteRequestSchema = z.object({
  trackId: FilesystemSafeIdSchema,
  candidateId: FilesystemSafeIdSchema,
  outputDir: z.string().min(1).optional(),
});
export type QuantAutoresearchPromoteRequest = z.input<typeof QuantAutoresearchPromoteRequestSchema>;

export const QuantAutoresearchRejectRequestSchema = z.object({
  trackId: FilesystemSafeIdSchema,
  candidateId: FilesystemSafeIdSchema,
  outputDir: z.string().min(1).optional(),
});
export type QuantAutoresearchRejectRequest = z.input<typeof QuantAutoresearchRejectRequestSchema>;

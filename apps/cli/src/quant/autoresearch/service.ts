import { randomBytes, randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { mutateWithEvent, ServiceError } from "@tonquant/core";
import type { z } from "zod";
import { resolveInstrumentSelection } from "../market/selection.js";
import { runOrchestrator } from "../orchestrator.js";
import { listArtifacts } from "../runner/artifact-manager.js";
import {
  type ArtifactRef,
  ArtifactRefSchema,
  type QuantAutoresearchBaselineSpec,
  QuantAutoresearchBaselineSpecSchema,
  type QuantAutoresearchCandidate,
  QuantAutoresearchCandidateSchema,
  type QuantAutoresearchHistoryEntry,
  QuantAutoresearchHistoryEntrySchema,
  type QuantAutoresearchInitRequest,
  QuantAutoresearchInitRequestSchema,
  type QuantAutoresearchListRequest,
  type QuantAutoresearchListResult,
  QuantAutoresearchListResultSchema,
  type QuantAutoresearchPromoteRequest,
  QuantAutoresearchPromoteRequestSchema,
  type QuantAutoresearchRejectRequest,
  QuantAutoresearchRejectRequestSchema,
  type QuantAutoresearchRunRequest,
  QuantAutoresearchRunRequestSchema,
  QuantAutoresearchRunSummarySchema,
  type QuantAutoresearchState,
  QuantAutoresearchStateSchema,
  type QuantAutoresearchStatusRequest,
  QuantAutoresearchStatusRequestSchema,
  type QuantAutoresearchTrackResult,
  QuantAutoresearchTrackResultSchema,
  type QuantAutoresearchTrackSummary,
  QuantAutoresearchTrackSummarySchema,
  TONQUANT_QUANT_ROOT,
} from "../types/index.js";

const HISTORY_FILE = "history.jsonl";
const BASELINE_FILE = "baseline.json";
const STATE_FILE = "state.json";
const CANDIDATES_DIR = "candidates";
const DEFAULT_FACTORS = ["rsi", "macd", "volatility"];

class AutoresearchTrackNotFoundError extends ServiceError {
  constructor(trackId: string) {
    super(`Autoresearch track '${trackId}' not found.`, "AUTORESEARCH_TRACK_NOT_FOUND");
    this.name = "AutoresearchTrackNotFoundError";
  }
}

class AutoresearchCandidateNotFoundError extends ServiceError {
  constructor(trackId: string, candidateId: string) {
    super(
      `Candidate '${candidateId}' was not found in track '${trackId}'.`,
      "AUTORESEARCH_CANDIDATE_NOT_FOUND",
    );
    this.name = "AutoresearchCandidateNotFoundError";
  }
}

class AutoresearchStateError extends ServiceError {
  constructor(message: string, code = "AUTORESEARCH_INVALID_STATE") {
    super(message, code);
    this.name = "AutoresearchStateError";
  }
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
  }
}

function ensureParentDir(path: string): void {
  ensureDir(dirname(path));
}

function writeJsonFileAtomic(path: string, data: unknown): void {
  ensureParentDir(path);
  const tmp = join(dirname(path), `.${randomBytes(4).toString("hex")}-${Date.now()}.json.tmp`);
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  renameSync(tmp, path);
}

function appendTextFile(path: string, content: string): void {
  ensureParentDir(path);
  appendFileSync(path, content, "utf-8");
}

function parseJsonFile<T>(
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  code: string,
  missingMessage: string,
): T {
  if (!existsSync(path)) {
    throw new ServiceError(missingMessage, code);
  }
  try {
    return schema.parse(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    throw new ServiceError(`Corrupted autoresearch file: ${path}`, code);
  }
}

function parseHistoryFile(path: string): QuantAutoresearchHistoryEntry[] {
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, "utf-8").trim();
    if (!raw) return [];
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => QuantAutoresearchHistoryEntrySchema.parse(JSON.parse(line)))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  } catch {
    throw new ServiceError(
      `Corrupted autoresearch history: ${path}`,
      "AUTORESEARCH_HISTORY_CORRUPTED",
    );
  }
}

function resolveQuantRoot(outputDir?: string): string {
  return outputDir ? join(outputDir, "quant") : TONQUANT_QUANT_ROOT;
}

function trackDir(trackId: string, outputDir?: string): string {
  return join(resolveQuantRoot(outputDir), "autoresearch", trackId);
}

function baselinePath(trackId: string, outputDir?: string): string {
  return join(trackDir(trackId, outputDir), BASELINE_FILE);
}

function statePath(trackId: string, outputDir?: string): string {
  return join(trackDir(trackId, outputDir), STATE_FILE);
}

function historyPath(trackId: string, outputDir?: string): string {
  return join(trackDir(trackId, outputDir), HISTORY_FILE);
}

function candidatePath(trackId: string, candidateId: string, outputDir?: string): string {
  return join(trackDir(trackId, outputDir), CANDIDATES_DIR, `${candidateId}.json`);
}

function nowIso(): string {
  return new Date().toISOString();
}

function generateTrackId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  const suffix = randomBytes(3).toString("hex");
  return [slug || "track", suffix].join("-");
}

function readBaseline(trackId: string, outputDir?: string): QuantAutoresearchBaselineSpec {
  return parseJsonFile(
    baselinePath(trackId, outputDir),
    QuantAutoresearchBaselineSpecSchema,
    "AUTORESEARCH_TRACK_CORRUPTED",
    `Missing baseline for track '${trackId}'.`,
  );
}

function readState(trackId: string, outputDir?: string): QuantAutoresearchState {
  return parseJsonFile(
    statePath(trackId, outputDir),
    QuantAutoresearchStateSchema,
    "AUTORESEARCH_TRACK_CORRUPTED",
    `Missing state for track '${trackId}'.`,
  );
}

function readCandidates(trackId: string, outputDir?: string): QuantAutoresearchCandidate[] {
  const dir = join(trackDir(trackId, outputDir), CANDIDATES_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) =>
      parseJsonFile(
        join(dir, file),
        QuantAutoresearchCandidateSchema,
        "AUTORESEARCH_TRACK_CORRUPTED",
        `Missing candidate file: ${file}`,
      ),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function loadTrack(
  trackId: string,
  outputDir?: string,
): {
  baseline: QuantAutoresearchBaselineSpec;
  state: QuantAutoresearchState;
  candidates: QuantAutoresearchCandidate[];
  history: QuantAutoresearchHistoryEntry[];
} {
  const dir = trackDir(trackId, outputDir);
  if (!existsSync(dir)) {
    throw new AutoresearchTrackNotFoundError(trackId);
  }
  return {
    baseline: canonicalizeBaseline(readBaseline(trackId, outputDir)),
    state: readState(trackId, outputDir),
    candidates: readCandidates(trackId, outputDir),
    history: parseHistoryFile(historyPath(trackId, outputDir)),
  };
}

function canonicalizeBaseline(
  baseline: QuantAutoresearchBaselineSpec,
): QuantAutoresearchBaselineSpec {
  const normalized = resolveInstrumentSelection({
    assetClass: baseline.assetClass,
    marketRegion: baseline.marketRegion,
    venue: baseline.venue,
    provider: baseline.provider,
    symbols: baseline.symbols,
    instruments: baseline.instruments,
  });
  return QuantAutoresearchBaselineSpecSchema.parse({
    ...baseline,
    assetClass: normalized.assetClass,
    marketRegion: normalized.marketRegion,
    venue: normalized.venue,
    provider: normalized.provider,
    symbols: [...normalized.symbols],
    instruments: normalized.instruments,
  });
}

function listTrackIds(outputDir?: string): string[] {
  const root = join(resolveQuantRoot(outputDir), "autoresearch");
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((entry) => existsSync(join(root, entry, BASELINE_FILE)))
    .sort();
}

function collectTrackArtifacts(
  trackId: string,
  candidates: QuantAutoresearchCandidate[],
  outputDir?: string,
): ArtifactRef[] {
  const ownArtifacts = listArtifacts(trackDir(trackId, outputDir));
  const merged = new Map<string, ArtifactRef>();
  for (const artifact of ownArtifacts) {
    merged.set(artifact.path, ArtifactRefSchema.parse(artifact));
  }
  for (const candidate of candidates) {
    for (const artifact of candidate.artifacts) {
      const parsed = ArtifactRefSchema.parse(artifact);
      merged.set(parsed.path, parsed);
    }
  }
  return [...merged.values()];
}

function buildTrackSummary(
  baseline: QuantAutoresearchBaselineSpec,
  state: QuantAutoresearchState,
  candidates: QuantAutoresearchCandidate[],
): QuantAutoresearchTrackSummary {
  const pendingPromotionCount = candidates.filter(
    (candidate) => candidate.status === "pending-review" || candidate.status === "kept",
  ).length;
  const keptCandidateCount = candidates.filter((candidate) => candidate.status === "kept").length;
  return QuantAutoresearchTrackSummarySchema.parse({
    trackId: baseline.trackId,
    title: baseline.title,
    thesis: baseline.thesis,
    status: state.status,
    assetClass: baseline.assetClass,
    marketRegion: baseline.marketRegion,
    venue: baseline.venue,
    updatedAt: state.updatedAt,
    candidateCount: candidates.length,
    keptCandidateCount,
    pendingPromotionCount,
  });
}

function trackSummaryText(
  state: QuantAutoresearchState,
  candidateCount: number,
  historyCount: number,
): string {
  const latestRun = state.latestRun?.runId ? ` latest run ${state.latestRun.runId}.` : "";
  return `${candidateCount} candidate(s), ${historyCount} history event(s), status ${state.status}.${latestRun}`;
}

function buildTrackResult(
  baseline: QuantAutoresearchBaselineSpec,
  state: QuantAutoresearchState,
  candidates: QuantAutoresearchCandidate[],
  history: QuantAutoresearchHistoryEntry[],
  outputDir?: string,
): QuantAutoresearchTrackResult {
  return QuantAutoresearchTrackResultSchema.parse({
    runId: state.latestRun?.runId ?? `track-${baseline.trackId}`,
    status: state.status,
    summary: trackSummaryText(state, candidates.length, history.length),
    artifacts: collectTrackArtifacts(baseline.trackId, candidates, outputDir),
    baseline,
    state,
    candidates,
    history,
  });
}

function historyLine(entry: QuantAutoresearchHistoryEntry): string {
  return `${JSON.stringify(entry)}\n`;
}

function createHistoryEntry(input: {
  eventType: string;
  message: string;
  candidateId?: string;
  runId?: string;
}): QuantAutoresearchHistoryEntry {
  return QuantAutoresearchHistoryEntrySchema.parse({
    timestamp: nowIso(),
    eventType: input.eventType,
    candidateId: input.candidateId ?? null,
    runId: input.runId ?? null,
    message: input.message,
  });
}

function writeTrackFiles(input: {
  trackId: string;
  baseline?: QuantAutoresearchBaselineSpec;
  state?: QuantAutoresearchState;
  historyEntries?: QuantAutoresearchHistoryEntry[];
  candidates?: QuantAutoresearchCandidate[];
  outputDir?: string;
}): void {
  const dir = trackDir(input.trackId, input.outputDir);
  ensureDir(join(dir, CANDIDATES_DIR));
  if (input.baseline) {
    writeJsonFileAtomic(baselinePath(input.trackId, input.outputDir), input.baseline);
  }
  if (input.state) {
    writeJsonFileAtomic(statePath(input.trackId, input.outputDir), input.state);
  }
  if (input.historyEntries?.length) {
    appendTextFile(
      historyPath(input.trackId, input.outputDir),
      input.historyEntries.map(historyLine).join(""),
    );
  }
  for (const candidate of input.candidates ?? []) {
    writeJsonFileAtomic(
      candidatePath(input.trackId, candidate.candidateId, input.outputDir),
      candidate,
    );
  }
}

function assertRunnableState(state: QuantAutoresearchState, trackId: string): void {
  if (state.status === "running") {
    throw new AutoresearchStateError(`Track '${trackId}' is already running.`);
  }
}

function assertPromotableCandidate(candidate: QuantAutoresearchCandidate, trackId: string): void {
  if (candidate.status !== "pending-review" && candidate.status !== "kept") {
    throw new AutoresearchStateError(
      `Candidate '${candidate.candidateId}' in track '${trackId}' cannot be promoted from status '${candidate.status}'.`,
    );
  }
}

function assertRejectableCandidate(candidate: QuantAutoresearchCandidate, trackId: string): void {
  if (candidate.status !== "pending-review" && candidate.status !== "kept") {
    throw new AutoresearchStateError(
      `Candidate '${candidate.candidateId}' in track '${trackId}' cannot be rejected from status '${candidate.status}'.`,
    );
  }
}

function nextReviewStatus(
  candidates: QuantAutoresearchCandidate[],
  previousStatus: QuantAutoresearchState["status"],
): QuantAutoresearchState["status"] {
  const hasPending = candidates.some((candidate) => candidate.status === "pending-review");
  if (hasPending) return "pending-review";
  return previousStatus === "blocked" ? "blocked" : "idle";
}

function candidateMetricsFromResult(result: Awaited<ReturnType<typeof runOrchestrator>>): {
  sharpe?: number | null;
  totalReturn?: number | null;
  maxDrawdown?: number | null;
  winRate?: number | null;
  tradeCount?: number | null;
} {
  return {
    sharpe: result.data?.metrics.sharpe ?? null,
    totalReturn: result.data?.metrics.totalReturn ?? null,
    maxDrawdown: result.data?.metrics.maxDrawdown ?? null,
    winRate: result.data?.metrics.winRate ?? null,
    tradeCount: result.data?.metrics.tradeCount ?? null,
  };
}

export async function initTrack(
  request: QuantAutoresearchInitRequest,
): Promise<QuantAutoresearchTrackResult> {
  const parsed = QuantAutoresearchInitRequestSchema.parse(request);
  const trackId = parsed.trackId ?? generateTrackId(parsed.title);
  const createdAt = nowIso();
  const normalized = resolveInstrumentSelection(parsed);
  const baseline = QuantAutoresearchBaselineSpecSchema.parse({
    ...parsed,
    assetClass: normalized.assetClass,
    marketRegion: normalized.marketRegion,
    trackId,
    provider: normalized.provider,
    venue: normalized.venue,
    symbols: [...normalized.symbols],
    instruments: normalized.instruments,
    baselineRunId: null,
    baselineMetrics: {},
    createdAt,
    updatedAt: createdAt,
  });
  const state = QuantAutoresearchStateSchema.parse({
    trackId,
    title: parsed.title,
    status: "idle",
    createdAt,
    updatedAt: createdAt,
    latestRun: null,
  });
  const entry = createHistoryEntry({
    eventType: "autoresearch.init",
    message: `Initialized track '${parsed.title}'.`,
  });

  mutateWithEvent({
    paths: [
      baselinePath(trackId, parsed.outputDir),
      statePath(trackId, parsed.outputDir),
      historyPath(trackId, parsed.outputDir),
    ],
    event: {
      type: "autoresearch.init",
      entity: { kind: "autoresearch-track", id: trackId },
      result: "success",
      summary: `Initialized autoresearch track ${trackId}.`,
      payload: {
        title: parsed.title,
        strategy: parsed.strategy,
        symbolCount: parsed.symbols.length,
        assetClass: parsed.assetClass,
        marketRegion: parsed.marketRegion,
      },
    },
    apply: () => {
      if (existsSync(trackDir(trackId, parsed.outputDir))) {
        throw new AutoresearchStateError(
          `Track '${trackId}' already exists.`,
          "AUTORESEARCH_TRACK_EXISTS",
        );
      }
      writeTrackFiles({
        trackId,
        baseline,
        state,
        historyEntries: [entry],
        outputDir: parsed.outputDir,
      });
      return trackId;
    },
  });

  return buildTrackResult(baseline, state, [], [entry], parsed.outputDir);
}

export function getTrack(request: QuantAutoresearchStatusRequest): QuantAutoresearchTrackResult {
  const parsed = QuantAutoresearchStatusRequestSchema.parse(request);
  const loaded = loadTrack(parsed.trackId, parsed.outputDir);
  return buildTrackResult(
    loaded.baseline,
    loaded.state,
    loaded.candidates,
    loaded.history,
    parsed.outputDir,
  );
}

export function listTracks(
  request: QuantAutoresearchListRequest = {},
): QuantAutoresearchListResult {
  const tracks = listTrackIds(request.outputDir).map((trackId) => {
    const loaded = loadTrack(trackId, request.outputDir);
    return buildTrackSummary(loaded.baseline, loaded.state, loaded.candidates);
  });
  return QuantAutoresearchListResultSchema.parse({
    runId: `list-${Date.now()}`,
    status: "completed",
    summary: `${tracks.length} autoresearch track(s) found.`,
    artifacts: [],
    tracks,
  });
}

export async function runTrack(
  request: QuantAutoresearchRunRequest,
): Promise<QuantAutoresearchTrackResult> {
  const parsed = QuantAutoresearchRunRequestSchema.parse(request);
  let loaded = loadTrack(parsed.trackId, parsed.outputDir);

  const trackRunId = randomUUID();
  const startedAt = nowIso();
  const startEntry = createHistoryEntry({
    eventType: "autoresearch.run.start",
    runId: trackRunId,
    message: `Started autoresearch run ${trackRunId} for '${loaded.baseline.title}'.`,
  });
  let runningState: QuantAutoresearchState | null = null;

  mutateWithEvent({
    paths: [
      statePath(parsed.trackId, parsed.outputDir),
      historyPath(parsed.trackId, parsed.outputDir),
    ],
    event: {
      type: "autoresearch.run.start",
      entity: { kind: "autoresearch-track", id: parsed.trackId },
      result: "success",
      summary: `Started autoresearch run ${trackRunId}.`,
      payload: {
        iterationsRequested: parsed.iterations,
      },
    },
    apply: () => {
      loaded = loadTrack(parsed.trackId, parsed.outputDir);
      assertRunnableState(loaded.state, parsed.trackId);
      runningState = QuantAutoresearchStateSchema.parse({
        ...loaded.state,
        status: "running",
        updatedAt: startedAt,
        latestRun: QuantAutoresearchRunSummarySchema.parse({
          runId: trackRunId,
          status: "running",
          iterationsRequested: parsed.iterations,
          iterationsCompleted: 0,
          keptCount: 0,
          discardedCount: 0,
          startedAt,
          completedAt: null,
          stopReason: null,
        }),
      });
      writeTrackFiles({
        trackId: parsed.trackId,
        state: runningState,
        historyEntries: [startEntry],
        outputDir: parsed.outputDir,
      });
      return trackRunId;
    },
  });
  if (!runningState) {
    throw new AutoresearchStateError(
      `Failed to enter running state for track '${parsed.trackId}'.`,
      "AUTORESEARCH_RUN_STATE",
    );
  }

  const successfulResults: Array<{
    runId: string;
    result: Awaited<ReturnType<typeof runOrchestrator>>;
  }> = [];
  let failureMessage: string | null = null;

  for (let index = 0; index < parsed.iterations; index++) {
    const iterationRunId = `${trackRunId}-${index + 1}`;
    try {
      const result = await runOrchestrator({
        asset: loaded.baseline.symbols.join(", "),
        symbols: loaded.baseline.symbols,
        instruments: loaded.baseline.instruments,
        assetClass: loaded.baseline.assetClass,
        marketRegion: loaded.baseline.marketRegion,
        venue: loaded.baseline.venue,
        provider: loaded.baseline.provider ?? undefined,
        startDate: loaded.baseline.startDate,
        endDate: loaded.baseline.endDate,
        strategy: loaded.baseline.strategy,
        factors: DEFAULT_FACTORS,
        iterations: 1,
        outputDir: parsed.outputDir,
        runId: iterationRunId,
        params: loaded.baseline.params,
        costConfig: loaded.baseline.costConfig ?? undefined,
      });
      if (result.status !== "success" || !result.data) {
        failureMessage =
          result.error ?? `Autoresearch iteration ${index + 1} did not complete successfully.`;
        break;
      }
      successfulResults.push({ runId: iterationRunId, result });
    } catch (error) {
      failureMessage = error instanceof Error ? error.message : String(error);
      break;
    }
  }

  const completedAt = nowIso();
  const candidateEntries = successfulResults.map(({ runId, result }) =>
    QuantAutoresearchCandidateSchema.parse({
      candidateId: runId,
      status: "pending-review",
      strategy: loaded.baseline.strategy,
      params: loaded.baseline.params,
      metrics: candidateMetricsFromResult(result),
      summary: result.data?.recommendation
        ? `Recommendation ${result.data.recommendation.toUpperCase()}`
        : `Completed run ${runId}`,
      artifacts: result.artifacts,
      createdAt: completedAt,
      updatedAt: completedAt,
    }),
  );

  const completionStatus = failureMessage ? "failed" : "completed";
  const completionSummary = QuantAutoresearchRunSummarySchema.parse({
    runId: trackRunId,
    status: completionStatus,
    iterationsRequested: parsed.iterations,
    iterationsCompleted: successfulResults.length,
    keptCount: 0,
    discardedCount: 0,
    startedAt,
    completedAt,
    stopReason: failureMessage,
  });
  const currentRunningState: QuantAutoresearchState = runningState ?? loaded.state;
  const nextState = QuantAutoresearchStateSchema.parse({
    ...currentRunningState,
    status: failureMessage ? "blocked" : "pending-review",
    iterationsUsed: loaded.state.iterationsUsed + successfulResults.length,
    latestCandidateId:
      candidateEntries.at(-1)?.candidateId ?? loaded.state.latestCandidateId ?? null,
    latestRun: completionSummary,
    updatedAt: completedAt,
  });
  const completionEntry = createHistoryEntry({
    eventType: failureMessage ? "autoresearch.run.fail" : "autoresearch.run.complete",
    runId: trackRunId,
    message: failureMessage
      ? `Run ${trackRunId} failed after ${successfulResults.length} successful iteration(s): ${failureMessage}`
      : `Run ${trackRunId} completed with ${candidateEntries.length} candidate(s).`,
  });

  const persistedCandidates = [...loaded.candidates, ...candidateEntries];
  mutateWithEvent({
    paths: [
      statePath(parsed.trackId, parsed.outputDir),
      historyPath(parsed.trackId, parsed.outputDir),
      ...candidateEntries.map((candidate) =>
        candidatePath(parsed.trackId, candidate.candidateId, parsed.outputDir),
      ),
    ],
    event: {
      type: failureMessage ? "autoresearch.run.fail" : "autoresearch.run.complete",
      entity: { kind: "autoresearch-track", id: parsed.trackId },
      result: failureMessage ? "failure" : "success",
      summary: completionEntry.message,
      payload: {
        runId: trackRunId,
        iterationsCompleted: successfulResults.length,
        candidateCount: candidateEntries.length,
      },
    },
    apply: () => {
      writeTrackFiles({
        trackId: parsed.trackId,
        state: nextState,
        historyEntries: [completionEntry],
        candidates: candidateEntries,
        outputDir: parsed.outputDir,
      });
      return trackRunId;
    },
  });

  return buildTrackResult(
    loaded.baseline,
    nextState,
    persistedCandidates,
    [...loaded.history, startEntry, completionEntry],
    parsed.outputDir,
  );
}

export async function promoteCandidate(
  request: QuantAutoresearchPromoteRequest,
): Promise<QuantAutoresearchTrackResult> {
  const parsed = QuantAutoresearchPromoteRequestSchema.parse(request);
  let loaded = loadTrack(parsed.trackId, parsed.outputDir);
  let updatedBaseline: QuantAutoresearchBaselineSpec | null = null;
  let updatedState: QuantAutoresearchState | null = null;
  let updatedCandidates: QuantAutoresearchCandidate[] = [];
  let entry: QuantAutoresearchHistoryEntry | null = null;
  let updatedCandidateId = parsed.candidateId;

  mutateWithEvent({
    paths: [
      baselinePath(parsed.trackId, parsed.outputDir),
      statePath(parsed.trackId, parsed.outputDir),
      historyPath(parsed.trackId, parsed.outputDir),
      candidatePath(parsed.trackId, parsed.candidateId, parsed.outputDir),
    ],
    event: {
      type: "autoresearch.promote",
      entity: { kind: "autoresearch-candidate", id: parsed.candidateId },
      result: "success",
      summary: `Promoted candidate '${parsed.candidateId}'.`,
      payload: {
        trackId: parsed.trackId,
      },
    },
    apply: () => {
      loaded = loadTrack(parsed.trackId, parsed.outputDir);
      const candidate = loaded.candidates.find(
        (existing) => existing.candidateId === parsed.candidateId,
      );
      if (!candidate) {
        throw new AutoresearchCandidateNotFoundError(parsed.trackId, parsed.candidateId);
      }
      assertPromotableCandidate(candidate, parsed.trackId);

      const updatedAt = nowIso();
      const updatedCandidate = QuantAutoresearchCandidateSchema.parse({
        ...candidate,
        status: "promoted",
        updatedAt,
      });
      updatedCandidateId = updatedCandidate.candidateId;
      updatedCandidates = loaded.candidates.map((existing) =>
        existing.candidateId === parsed.candidateId ? updatedCandidate : existing,
      );
      updatedBaseline = QuantAutoresearchBaselineSpecSchema.parse({
        ...loaded.baseline,
        baselineRunId: updatedCandidate.candidateId,
        baselineMetrics: updatedCandidate.metrics,
        updatedAt,
      });
      updatedState = QuantAutoresearchStateSchema.parse({
        ...loaded.state,
        bestCandidateId: updatedCandidate.candidateId,
        status: nextReviewStatus(updatedCandidates, loaded.state.status),
        updatedAt,
      });
      entry = createHistoryEntry({
        eventType: "autoresearch.promote",
        candidateId: updatedCandidate.candidateId,
        runId: updatedState.latestRun?.runId ?? undefined,
        message: `Promoted candidate '${updatedCandidate.candidateId}'.`,
      });
      writeTrackFiles({
        trackId: parsed.trackId,
        baseline: updatedBaseline,
        state: updatedState,
        historyEntries: entry ? [entry] : [],
        candidates: [updatedCandidate],
        outputDir: parsed.outputDir,
      });
      return parsed.candidateId;
    },
  });
  if (!updatedBaseline || !updatedState || !entry) {
    throw new AutoresearchStateError(
      `Failed to promote candidate '${updatedCandidateId}'.`,
      "AUTORESEARCH_PROMOTE_STATE",
    );
  }

  return buildTrackResult(
    updatedBaseline,
    updatedState,
    updatedCandidates,
    [...loaded.history, entry],
    parsed.outputDir,
  );
}

export async function rejectCandidate(
  request: QuantAutoresearchRejectRequest,
): Promise<QuantAutoresearchTrackResult> {
  const parsed = QuantAutoresearchRejectRequestSchema.parse(request);
  let loaded = loadTrack(parsed.trackId, parsed.outputDir);
  let updatedState: QuantAutoresearchState | null = null;
  let updatedCandidates: QuantAutoresearchCandidate[] = [];
  let entry: QuantAutoresearchHistoryEntry | null = null;
  let updatedCandidateId = parsed.candidateId;

  mutateWithEvent({
    paths: [
      statePath(parsed.trackId, parsed.outputDir),
      historyPath(parsed.trackId, parsed.outputDir),
      candidatePath(parsed.trackId, parsed.candidateId, parsed.outputDir),
    ],
    event: {
      type: "autoresearch.reject",
      entity: { kind: "autoresearch-candidate", id: parsed.candidateId },
      result: "success",
      summary: `Rejected candidate '${parsed.candidateId}'.`,
      payload: {
        trackId: parsed.trackId,
      },
    },
    apply: () => {
      loaded = loadTrack(parsed.trackId, parsed.outputDir);
      const candidate = loaded.candidates.find(
        (existing) => existing.candidateId === parsed.candidateId,
      );
      if (!candidate) {
        throw new AutoresearchCandidateNotFoundError(parsed.trackId, parsed.candidateId);
      }
      assertRejectableCandidate(candidate, parsed.trackId);

      const updatedAt = nowIso();
      const updatedCandidate = QuantAutoresearchCandidateSchema.parse({
        ...candidate,
        status: "rejected",
        updatedAt,
      });
      updatedCandidateId = updatedCandidate.candidateId;
      updatedCandidates = loaded.candidates.map((existing) =>
        existing.candidateId === parsed.candidateId ? updatedCandidate : existing,
      );
      updatedState = QuantAutoresearchStateSchema.parse({
        ...loaded.state,
        status: nextReviewStatus(updatedCandidates, loaded.state.status),
        updatedAt,
      });
      entry = createHistoryEntry({
        eventType: "autoresearch.reject",
        candidateId: updatedCandidate.candidateId,
        runId: updatedState.latestRun?.runId ?? undefined,
        message: `Rejected candidate '${updatedCandidate.candidateId}'.`,
      });
      writeTrackFiles({
        trackId: parsed.trackId,
        state: updatedState,
        historyEntries: entry ? [entry] : [],
        candidates: [updatedCandidate],
        outputDir: parsed.outputDir,
      });
      return parsed.candidateId;
    },
  });
  if (!updatedState || !entry) {
    throw new AutoresearchStateError(
      `Failed to reject candidate '${updatedCandidateId}'.`,
      "AUTORESEARCH_REJECT_STATE",
    );
  }

  return buildTrackResult(
    loaded.baseline,
    updatedState,
    updatedCandidates,
    [...loaded.history, entry],
    parsed.outputDir,
  );
}

export function removeTrackArtifactsForTests(outputDir: string): void {
  rmSync(resolveQuantRoot(outputDir), { force: true, recursive: true });
}

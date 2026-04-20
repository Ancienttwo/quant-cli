import {
  getTrack,
  initTrack,
  listTracks,
  promoteCandidate,
  rejectCandidate,
  runTrack,
} from "../autoresearch/index.js";
import {
  type QuantAutoresearchInitRequest,
  QuantAutoresearchInitRequestSchema,
  type QuantAutoresearchListRequest,
  QuantAutoresearchListRequestSchema,
  type QuantAutoresearchListResult,
  QuantAutoresearchListResultSchema,
  type QuantAutoresearchPromoteRequest,
  QuantAutoresearchPromoteRequestSchema,
  type QuantAutoresearchRejectRequest,
  QuantAutoresearchRejectRequestSchema,
  type QuantAutoresearchRunRequest,
  QuantAutoresearchRunRequestSchema,
  type QuantAutoresearchStatusRequest,
  QuantAutoresearchStatusRequestSchema,
  type QuantAutoresearchTrackResult,
  QuantAutoresearchTrackResultSchema,
} from "../types/index.js";
import { resolveInstrumentSelection } from "./request-market.js";
import { invokeLocalQuantOperation, type RunQuantApiOptions } from "./shared.js";

export async function initAutoresearchTrack(
  request: QuantAutoresearchInitRequest,
  options?: RunQuantApiOptions,
): Promise<QuantAutoresearchTrackResult> {
  const parsed = QuantAutoresearchInitRequestSchema.parse(request);
  const normalized = resolveInstrumentSelection(parsed);
  return invokeLocalQuantOperation(
    "autoresearch-runs",
    normalized,
    normalized,
    (raw) => QuantAutoresearchTrackResultSchema.parse(raw),
    async () => initTrack(normalized),
    options,
  );
}

export async function runAutoresearchTrack(
  request: QuantAutoresearchRunRequest,
  options?: RunQuantApiOptions,
): Promise<QuantAutoresearchTrackResult> {
  const parsed = QuantAutoresearchRunRequestSchema.parse(request);
  return invokeLocalQuantOperation(
    "autoresearch-runs",
    parsed,
    parsed,
    (raw) => QuantAutoresearchTrackResultSchema.parse(raw),
    async () => runTrack(parsed),
    options,
  );
}

export async function getAutoresearchTrack(
  request: QuantAutoresearchStatusRequest,
  options?: RunQuantApiOptions,
): Promise<QuantAutoresearchTrackResult> {
  const parsed = QuantAutoresearchStatusRequestSchema.parse(request);
  return invokeLocalQuantOperation(
    "autoresearch-runs",
    parsed,
    parsed,
    (raw) => QuantAutoresearchTrackResultSchema.parse(raw),
    async () => getTrack(parsed),
    options,
  );
}

export async function listAutoresearchTracks(
  request: QuantAutoresearchListRequest = {},
  options?: RunQuantApiOptions,
): Promise<QuantAutoresearchListResult> {
  const parsed = QuantAutoresearchListRequestSchema.parse(request);
  return invokeLocalQuantOperation(
    "autoresearch-runs",
    parsed,
    parsed,
    (raw) => QuantAutoresearchListResultSchema.parse(raw),
    async () => listTracks(parsed),
    options,
  );
}

export async function promoteAutoresearchCandidate(
  request: QuantAutoresearchPromoteRequest,
  options?: RunQuantApiOptions,
): Promise<QuantAutoresearchTrackResult> {
  const parsed = QuantAutoresearchPromoteRequestSchema.parse(request);
  return invokeLocalQuantOperation(
    "autoresearch-runs",
    parsed,
    parsed,
    (raw) => QuantAutoresearchTrackResultSchema.parse(raw),
    async () => promoteCandidate(parsed),
    options,
  );
}

export async function rejectAutoresearchCandidate(
  request: QuantAutoresearchRejectRequest,
  options?: RunQuantApiOptions,
): Promise<QuantAutoresearchTrackResult> {
  const parsed = QuantAutoresearchRejectRequestSchema.parse(request);
  return invokeLocalQuantOperation(
    "autoresearch-runs",
    parsed,
    parsed,
    (raw) => QuantAutoresearchTrackResultSchema.parse(raw),
    async () => rejectCandidate(parsed),
    options,
  );
}

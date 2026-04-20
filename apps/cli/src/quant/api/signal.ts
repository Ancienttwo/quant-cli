import {
  type SignalEvaluateRequest,
  SignalEvaluateRequestSchema,
  type SignalEvaluateResult,
  SignalEvaluateResultSchema,
  type SignalListRequest,
  SignalListRequestSchema,
  type SignalListResult,
  SignalListResultSchema,
} from "../types/index.js";
import { withResolvedInstruments } from "./request-market.js";
import { invokeQuantCli, type RunQuantApiOptions } from "./shared.js";

export async function runSignalList(
  request: SignalListRequest = {},
  options?: RunQuantApiOptions,
): Promise<SignalListResult> {
  const parsed = SignalListRequestSchema.parse(request);
  return invokeQuantCli(
    "signals",
    ["signal", "list"],
    parsed,
    parsed,
    (raw) => SignalListResultSchema.parse(raw),
    options,
  );
}

export async function runSignalEvaluate(
  request: SignalEvaluateRequest,
  options?: RunQuantApiOptions,
): Promise<SignalEvaluateResult> {
  const parsed = SignalEvaluateRequestSchema.parse(request);
  const normalized = withResolvedInstruments(parsed);
  return invokeQuantCli(
    "signals",
    ["signal", "evaluate"],
    normalized,
    normalized,
    (raw) => SignalEvaluateResultSchema.parse(raw),
    options,
  );
}

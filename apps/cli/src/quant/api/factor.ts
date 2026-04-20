import {
  type FactorComputeRequest,
  FactorComputeRequestSchema,
  type FactorComputeResult,
  FactorComputeResultSchema,
  type FactorEvaluateRequest,
  FactorEvaluateRequestSchema,
  type FactorEvaluateResult,
  FactorEvaluateResultSchema,
  type FactorListRequest,
  FactorListRequestSchema,
  type FactorListResult,
  FactorListResultSchema,
} from "../types/index.js";
import { withResolvedInstruments } from "./request-market.js";
import { invokeQuantCli, type RunQuantApiOptions } from "./shared.js";

export async function runFactorList(
  request: FactorListRequest = {},
  options?: RunQuantApiOptions,
): Promise<FactorListResult> {
  const parsed = FactorListRequestSchema.parse(request);
  return invokeQuantCli(
    "factors",
    ["factor", "list"],
    parsed,
    parsed,
    (raw) => FactorListResultSchema.parse(raw),
    options,
  );
}

export async function runFactorCompute(
  request: FactorComputeRequest,
  options?: RunQuantApiOptions,
): Promise<FactorComputeResult> {
  const parsed = FactorComputeRequestSchema.parse(request);
  const normalized = withResolvedInstruments(parsed);
  return invokeQuantCli(
    "factors",
    ["factor", "compute"],
    normalized,
    normalized,
    (raw) => FactorComputeResultSchema.parse(raw),
    options,
  );
}

export async function runFactorEvaluate(
  request: FactorEvaluateRequest,
  options?: RunQuantApiOptions,
): Promise<FactorEvaluateResult> {
  const parsed = FactorEvaluateRequestSchema.parse(request);
  const normalized = withResolvedInstruments(parsed);
  return invokeQuantCli(
    "factors",
    ["factor", "evaluate"],
    normalized,
    normalized,
    (raw) => FactorEvaluateResultSchema.parse(raw),
    options,
  );
}

import {
  type PresetListRequest,
  PresetListRequestSchema,
  type PresetListResult,
  PresetListResultSchema,
  type PresetShowRequest,
  PresetShowRequestSchema,
  type PresetShowResult,
  PresetShowResultSchema,
} from "../types/index.js";
import { invokeQuantCli, type RunQuantApiOptions } from "./shared.js";

export async function runPresetList(
  request: PresetListRequest = {},
  options?: RunQuantApiOptions,
): Promise<PresetListResult> {
  const parsed = PresetListRequestSchema.parse(request);
  return invokeQuantCli(
    "presets",
    ["preset", "list"],
    parsed,
    parsed,
    (raw) => PresetListResultSchema.parse(raw),
    options,
  );
}

export async function runPresetShow(
  request: PresetShowRequest,
  options?: RunQuantApiOptions,
): Promise<PresetShowResult> {
  const parsed = PresetShowRequestSchema.parse(request);
  return invokeQuantCli(
    "presets",
    ["preset", "show"],
    parsed,
    parsed,
    (raw) => PresetShowResultSchema.parse(raw),
    options,
  );
}

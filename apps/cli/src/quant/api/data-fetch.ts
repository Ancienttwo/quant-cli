import {
  type DataFetchRequest,
  DataFetchRequestSchema,
  type DataFetchResult,
  DataFetchResultSchema,
  type DataInfoRequest,
  DataInfoRequestSchema,
  type DataInfoResult,
  DataInfoResultSchema,
  type DataListRequest,
  DataListRequestSchema,
  type DataListResult,
  DataListResultSchema,
} from "../types/index.js";
import { withResolvedInstruments } from "./request-market.js";
import { invokeQuantCli, type RunQuantApiOptions } from "./shared.js";

export async function runDataFetch(
  request: DataFetchRequest,
  options?: RunQuantApiOptions,
): Promise<DataFetchResult> {
  const parsed = DataFetchRequestSchema.parse(request);
  const normalized = withResolvedInstruments(parsed);
  return invokeQuantCli(
    "data-fetch",
    ["data", "fetch"],
    normalized,
    normalized,
    (raw) => DataFetchResultSchema.parse(raw),
    options,
  );
}

export async function runDataList(
  request: DataListRequest = {},
  options?: RunQuantApiOptions,
): Promise<DataListResult> {
  const parsed = DataListRequestSchema.parse(request);
  return invokeQuantCli(
    "data-fetch",
    ["data", "list"],
    parsed,
    parsed,
    (raw) => DataListResultSchema.parse(raw),
    options,
  );
}

export async function runDataInfo(
  request: DataInfoRequest,
  options?: RunQuantApiOptions,
): Promise<DataInfoResult> {
  const parsed = DataInfoRequestSchema.parse(request);
  const normalized = withResolvedInstruments({
    ...parsed,
    symbols: [parsed.symbol],
  });
  return invokeQuantCli(
    "data-fetch",
    ["data", "info"],
    normalized,
    normalized,
    (raw) => DataInfoResultSchema.parse(raw),
    options,
  );
}

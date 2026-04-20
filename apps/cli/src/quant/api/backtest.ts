import {
  type BacktestRequest,
  BacktestRequestSchema,
  type BacktestResult,
  BacktestResultSchema,
} from "../types/index.js";
import { withResolvedInstruments } from "./request-market.js";
import { invokeQuantCli, type RunQuantApiOptions } from "./shared.js";

export async function runBacktest(
  request: BacktestRequest,
  options?: RunQuantApiOptions,
): Promise<BacktestResult> {
  const parsed = BacktestRequestSchema.parse(request);
  const normalized = withResolvedInstruments(parsed);
  return invokeQuantCli(
    "backtests",
    ["backtest", "run"],
    normalized,
    normalized,
    (raw) => BacktestResultSchema.parse(raw),
    options,
  );
}

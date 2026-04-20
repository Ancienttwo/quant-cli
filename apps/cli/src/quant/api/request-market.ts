import {
  type InstrumentSelectionRequest,
  type InstrumentSelectionResult,
  resolveInstrumentSelection,
} from "../market/selection.js";

export { resolveInstrumentSelection };

export function withResolvedInstruments<T extends InstrumentSelectionRequest>(
  request: T,
): T & InstrumentSelectionResult {
  return resolveInstrumentSelection(request);
}

export class QuantBackendError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "QuantBackendError";
    this.code = code;
  }
}

export const QUANT_BACKEND_ERROR_MARKER = "__TONQUANT_BACKEND_ERROR__=";

export function isQuantBackendError(error: unknown): error is QuantBackendError {
  return error instanceof QuantBackendError;
}

export function serializeQuantBackendError(error: QuantBackendError): string {
  return `${QUANT_BACKEND_ERROR_MARKER}${JSON.stringify({
    code: error.code,
    message: error.message,
  })}`;
}

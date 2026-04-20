/**
 * Base error for service-level failures (API errors, validation errors, etc.).
 * Framework-agnostic — safe to use in CLI, web, or any other consumer.
 */
export class ServiceError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
  }
}

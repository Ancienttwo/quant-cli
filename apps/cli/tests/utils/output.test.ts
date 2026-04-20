import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { EventLogWriteError } from "@tonquant/core";
import { MutationReceiptSchema } from "../../src/types/cli.js";
import {
  CliCommandError,
  formatError,
  formatOutput,
  handleCommand,
} from "../../src/utils/output.js";
import { attachReceipt } from "../../src/utils/receipts.js";

let stderrWriteSpy: ReturnType<typeof spyOn>;
let stdoutWriteSpy: ReturnType<typeof spyOn>;
let exitSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  stderrWriteSpy = spyOn(process.stderr, "write").mockImplementation(() => true);
  stdoutWriteSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
  exitSpy = spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`EXIT:${code ?? 0}`);
  }) as never);
});

afterEach(() => {
  stderrWriteSpy.mockRestore();
  stdoutWriteSpy.mockRestore();
  exitSpy.mockRestore();
});

describe("formatOutput", () => {
  test("returns JSON envelope when json option is true", () => {
    const data = { symbol: "TON", price_usd: "1.85" };
    const result = formatOutput(data, { json: true });
    const parsed = JSON.parse(result);

    expect(parsed.status).toBe("ok");
    expect(parsed.data).toEqual(data);
  });

  test("calls human formatter when json option is false", () => {
    const data = { symbol: "TON" };
    const formatter = (d: typeof data) => `Token: ${d.symbol}`;
    const result = formatOutput(data, { json: false }, formatter);

    expect(result).toBe("Token: TON");
  });

  test("falls back to JSON.stringify when no human formatter provided", () => {
    const data = { symbol: "TON" };
    const result = formatOutput(data, { json: false });

    expect(result).toContain("TON");
  });

  test("appends mutation receipt details for human output", () => {
    const data = attachReceipt(
      { address: "UQ_test", network: "mainnet" },
      {
        action: "config.write",
        target: "wallet-config",
        writes: [{ kind: "config", path: "/tmp/tonquant.json" }],
        nextStep: "tonquant balance --json",
      },
    );
    const result = formatOutput(data, { json: false }, () => "Wallet configured");

    expect(result).toContain("Wallet configured");
    expect(result).toContain("Receipt: config.write -> wallet-config");
    expect(result).toContain("/tmp/tonquant.json");
    expect(result).toContain("Next: tonquant balance --json");
  });
});

describe("formatError", () => {
  test("returns JSON error envelope when json option is true", () => {
    const result = formatError("Not found", "NOT_FOUND", { json: true });
    const parsed = JSON.parse(result);

    expect(parsed.status).toBe("error");
    expect(parsed.error).toBe("Not found");
    expect(parsed.code).toBe("NOT_FOUND");
  });

  test("returns human-readable error when json option is false", () => {
    const result = formatError("Not found", "NOT_FOUND", { json: false });

    expect(result).toBe("Error [NOT_FOUND]: Not found");
  });
});

describe("CliCommandError", () => {
  test("has correct name, message, and code", () => {
    const error = new CliCommandError("test message", "TEST_CODE");

    expect(error.name).toBe("CliCommandError");
    expect(error.message).toBe("test message");
    expect(error.code).toBe("TEST_CODE");
    expect(error instanceof Error).toBe(true);
  });
});

describe("MutationReceiptSchema", () => {
  test("fills in bounded defaults for the shared receipt contract", () => {
    const receipt = MutationReceiptSchema.parse({
      action: "platform.signature.request",
      target: "ton_signal_alpha",
    });

    expect(receipt.writes).toEqual([]);
    expect(receipt.warnings).toEqual([]);
  });
});

describe("handleCommand", () => {
  test("preserves ServiceError codes in JSON output", async () => {
    await expect(
      handleCommand(
        { json: true },
        async () => {
          throw new EventLogWriteError("Injected event log append failure.");
        },
        undefined,
      ),
    ).rejects.toThrow("EXIT:1");

    const output = stderrWriteSpy.mock.calls[0]?.[0];
    expect(typeof output).toBe("string");

    const parsed = JSON.parse(String(output).trim());
    expect(parsed.status).toBe("error");
    expect(parsed.code).toBe("EVENT_LOG_WRITE_FAILED");
    expect(parsed.code).not.toBe("UNKNOWN_ERROR");
  });
});

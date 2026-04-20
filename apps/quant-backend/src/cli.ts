#!/usr/bin/env bun

/**
 * TonQuant mock backend CLI.
 * Reads JSON from stdin, routes to handler, writes JSON to stdout.
 * Protocol: parent sends { runId, outputDir, ...request } on stdin,
 * this process writes JSON result to stdout and logs to stderr.
 */

import { isQuantBackendError, serializeQuantBackendError } from "./errors";
import { handleBacktest } from "./handlers/backtest";
import { handleDataFetch, handleDataInfo, handleDataList } from "./handlers/data";
import { handleFactorEvaluate } from "./handlers/evaluation";
import { handleFactorCompute, handleFactorList } from "./handlers/factor";
import { handlePresetList, handlePresetShow } from "./handlers/preset";

type Handler = (
  input: Record<string, unknown>,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

const ROUTES: Record<string, Handler> = {
  "data fetch": handleDataFetch,
  "data list": handleDataList,
  "data info": handleDataInfo,
  "factor list": handleFactorList,
  "factor compute": handleFactorCompute,
  "factor evaluate": handleFactorEvaluate,
  "backtest run": handleBacktest,
  "preset list": handlePresetList,
  "preset show": handlePresetShow,
};

async function main(): Promise<void> {
  // Read subcommand from argv (passed by runner as extra args after cli.ts)
  const args = process.argv.slice(2);
  const subcommand = args.join(" ");

  // Read JSON input from stdin
  const chunks: string[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(new TextDecoder().decode(chunk));
  }
  const rawInput = chunks.join("");

  let input: Record<string, unknown>;
  try {
    input = JSON.parse(rawInput);
  } catch {
    process.stderr.write(`Invalid JSON input: ${rawInput.slice(0, 200)}\n`);
    process.exit(1);
  }

  const handler = ROUTES[subcommand];
  if (!handler) {
    const available = Object.keys(ROUTES).join(", ");
    process.stderr.write(`Unknown subcommand: "${subcommand}". Available: ${available}\n`);
    process.exit(1);
  }

  try {
    process.stderr.write(`[quant-backend] Running: ${subcommand}\n`);
    const result = await handler(input);
    // Echo runId back so Zod schema validation passes
    const output = { runId: input.runId ?? "unknown", ...result };
    process.stdout.write(JSON.stringify(output));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isQuantBackendError(error)) {
      process.stderr.write(`${serializeQuantBackendError(error)}\n`);
      process.stderr.write(`[quant-backend] Error [${error.code}]: ${message}\n`);
    } else {
      process.stderr.write(`[quant-backend] Error [QUANT_BACKEND_ERROR]: ${message}\n`);
    }
    process.exit(1);
  }
}

main();

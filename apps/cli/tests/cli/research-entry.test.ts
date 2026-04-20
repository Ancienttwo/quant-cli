import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../../../..");
const cliEntry = resolve(repoRoot, "apps/cli/src/index.ts");
const decoder = new TextDecoder();

function runCli(args: string[]) {
  return Bun.spawnSync({
    cmd: [process.execPath, cliEntry, ...args],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      HOME: process.env.HOME ?? "/tmp",
    },
  });
}

describe("research CLI entrypoint", () => {
  test("root help exposes research and hides removed top-level commands", () => {
    const result = runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    const stdout = decoder.decode(result.stdout);
    expect(stdout).toContain("research");
    expect(stdout).not.toMatch(/^\s+market\s{2,}/m);
    expect(stdout).not.toMatch(/^\s+price\s{2,}/m);
  });

  test("research help exposes the unified research subcommands", () => {
    const result = runCli(["research", "--help"]);

    expect(result.exitCode).toBe(0);
    const stdout = decoder.decode(result.stdout);
    expect(stdout).toContain("quote [options] <symbol>");
    expect(stdout).toContain("search [options] <query>");
    expect(stdout).toContain("compare <symbol>");
    expect(stdout).toContain("candles [options] <symbol>");
    expect(stdout).toContain("liquidity <symbol>");
  });

  test("research quote help exposes OKX-first provider options", () => {
    const result = runCli(["research", "quote", "--help"]);

    expect(result.exitCode).toBe(0);
    const stdout = decoder.decode(result.stdout);
    expect(stdout).toContain("Provider (okx|binance|hyperliquid)");
  });

  test("removed market command returns a structured migration error", () => {
    const result = runCli(["--json", "market", "quote", "BTC"]);

    expect(result.exitCode).toBe(1);
    const stderr = JSON.parse(decoder.decode(result.stderr)) as {
      status: string;
      error: string;
      code: string;
    };
    expect(stderr.status).toBe("error");
    expect(stderr.code).toBe("CLI_MARKET_COMMAND_REMOVED");
    expect(stderr.error).toContain("tonquant research quote <symbol>");
  });

  test("removed price command returns a structured migration error", () => {
    const result = runCli(["--json", "price", "NOT"]);

    expect(result.exitCode).toBe(1);
    const stderr = JSON.parse(decoder.decode(result.stderr)) as {
      status: string;
      error: string;
      code: string;
    };
    expect(stderr.status).toBe("error");
    expect(stderr.code).toBe("CLI_PRICE_COMMAND_REMOVED");
    expect(stderr.error).toContain("tonquant research quote <symbol>");
    expect(stderr.error).toContain("tonquant research liquidity <symbol>");
  });

  test("research requires an explicit action instead of legacy symbol-only usage", () => {
    const result = runCli(["--json", "research", "BTC"]);

    expect(result.exitCode).toBe(1);
    const stderr = JSON.parse(decoder.decode(result.stderr)) as {
      status: string;
      error: string;
      code: string;
    };
    expect(stderr.status).toBe("error");
    expect(stderr.code).toBe("CLI_RESEARCH_ACTION_REQUIRED");
    expect(stderr.error).toContain("research quote BTC");
    expect(stderr.error).toContain("research liquidity BTC");
  });
});

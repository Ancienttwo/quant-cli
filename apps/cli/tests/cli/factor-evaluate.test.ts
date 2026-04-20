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

describe("factor evaluate CLI", () => {
  test("help exposes --n-trials without a default value", () => {
    const result = runCli(["factor", "evaluate", "--help"]);

    expect(result.exitCode).toBe(0);
    const stdout = decoder.decode(result.stdout);
    expect(stdout).toContain("--n-trials <n>");
    expect(stdout).not.toContain("default: 1");
  });

  test("rejects invalid --n-trials values during Commander parsing", () => {
    const result = runCli([
      "factor",
      "evaluate",
      "--definition-file",
      "/tmp/does-not-matter.json",
      "--liquidity-assumptions-file",
      "/tmp/does-not-matter-liquidity.json",
      "--cost-model-file",
      "/tmp/does-not-matter-cost.json",
      "--symbols",
      "AAPL,MSFT",
      "--n-trials",
      "0",
    ]);

    expect(result.exitCode).toBe(1);
    expect(decoder.decode(result.stderr)).toContain("--n-trials must be a positive integer");
  });
});

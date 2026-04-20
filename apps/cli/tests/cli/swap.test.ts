import { describe, expect, test } from "bun:test";
import { join } from "node:path";

function runCli(args: string[]) {
  return Bun.spawnSync({
    cmd: ["bun", "run", "src/index.ts", ...args],
    cwd: join(import.meta.dir, "../.."),
    stderr: "pipe",
    stdout: "pipe",
  });
}

describe("swap command surface", () => {
  test("help no longer advertises the execute flag", () => {
    const result = runCli(["swap", "--help"]);
    expect(result.exitCode).toBe(0);

    const help = result.stdout.toString();
    expect(help).not.toContain("--execute");
  });

  test("explicit compatibility flag returns a structured unsupported error", () => {
    const result = runCli(["--json", "swap", "TON", "NOT", "1", "--execute"]);
    expect(result.exitCode).toBe(1);

    const parsed = JSON.parse(result.stderr.toString());
    expect(parsed.status).toBe("error");
    expect(parsed.code).toBe("SWAP_EXECUTION_UNSUPPORTED");
  });
});

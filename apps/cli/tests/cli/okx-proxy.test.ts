import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../../../..");
const cliEntry = resolve(repoRoot, "apps/cli/src/index.ts");
const decoder = new TextDecoder();
const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function createFakeOkxCli(): string {
  const dir = createTempDir("tonquant-okx-cli-");
  const scriptPath = join(dir, "okx");
  writeFileSync(
    scriptPath,
    `#!/usr/bin/env bun
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: okx [--json] <module> <action>");
  console.log("Modules:");
  process.exit(0);
}
if (args.includes("--json") && args.includes("list-tools")) {
  console.log(JSON.stringify({ totalTools: 2, modules: [{ name: "market" }, { name: "account" }] }));
  process.exit(0);
}
console.error("unexpected args: " + args.join(" "));
process.exit(1);
`,
    "utf-8",
  );
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

function runCli(args: string[], envOverrides: Record<string, string | undefined> = {}) {
  return Bun.spawnSync({
    cmd: [process.execPath, cliEntry, ...args],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      HOME: process.env.HOME ?? "/tmp",
      ...envOverrides,
    },
  });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("OKX CLI proxy", () => {
  test("wraps JSON output from an externally installed okx CLI inside TonQuant's envelope", () => {
    const fakeOkx = createFakeOkxCli();
    const result = runCli(["--json", "okx", "list-tools"], {
      TONQUANT_OKX_CLI: fakeOkx,
    });
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(decoder.decode(result.stdout)) as {
      status: string;
      data: {
        provider: string;
        command: string[];
        result: { totalTools: number; modules: Array<{ name: string }> };
      };
    };

    expect(payload.status).toBe("ok");
    expect(payload.data.provider).toBe("okx-agent-trade-kit");
    expect(payload.data.command).toEqual(["--json", "list-tools"]);
    expect(payload.data.result.totalTools).toBe(2);
    expect(payload.data.result.modules.some((module) => module.name === "market")).toBe(true);
  });

  test("proxies human help output from an externally installed okx CLI", () => {
    const fakeOkx = createFakeOkxCli();
    const result = runCli(["okx", "--help"], {
      TONQUANT_OKX_CLI: fakeOkx,
    });
    expect(result.exitCode).toBe(0);
    const stdout = decoder.decode(result.stdout);
    expect(stdout).toContain("Usage: okx");
    expect(stdout).toContain("Modules:");
  });

  test("returns installation guidance when the official okx CLI is unavailable", () => {
    const result = runCli(["--json", "okx", "list-tools"], {
      TONQUANT_OKX_CLI: undefined,
      PATH: "/nonexistent",
    });
    expect(result.exitCode).toBe(1);
    const payload = JSON.parse(decoder.decode(result.stderr)) as {
      status: string;
      code: string;
      error: string;
    };
    expect(payload.status).toBe("error");
    expect(payload.code).toBe("OKX_CLI_NOT_CONFIGURED");
    expect(payload.error).toContain("@okx_ai/okx-trade-cli");
    expect(payload.error).toContain("okx/agent-skills");
  });
});

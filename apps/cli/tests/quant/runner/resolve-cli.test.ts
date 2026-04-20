import { describe, expect, test } from "bun:test";
import {
  resolveQuantCli,
  resolveQuantCliWithContext,
} from "../../../src/quant/runner/resolve-cli.js";

describe("resolveQuantCli", () => {
  test("resolves to repo quant-backend when it exists from cwd", () => {
    const result = resolveQuantCliWithContext({
      argv1: "/tmp/tonquant/dist/index.js",
      cwd: "/repo",
      exists: (path) => path === "/repo/apps/quant-backend/src/cli.ts",
      moduleUrl: "file:///repo/apps/cli/src/quant/runner/resolve-cli.ts",
    });
    expect(result[0]).toBe("bun");
    expect(result[1]).toBe("run");
    expect(result[2]).toBe("/repo/apps/quant-backend/src/cli.ts");
  });

  test("prefers packaged backend adjacent to the installed CLI entrypoint", () => {
    const result = resolveQuantCliWithContext({
      argv1: "/installed/lib/node_modules/tonquant/dist/index.js",
      cwd: "/repo",
      exists: (path) => path === "/installed/lib/node_modules/tonquant/dist/quant-backend.js",
      moduleUrl: "file:///repo/apps/cli/src/quant/runner/resolve-cli.ts",
    });
    expect(result).toEqual([
      "bun",
      "run",
      "/installed/lib/node_modules/tonquant/dist/quant-backend.js",
    ]);
  });

  test("falls back to module-relative monorepo backend when cwd is unrelated", () => {
    const result = resolveQuantCliWithContext({
      argv1: "/tmp/tonquant/dist/index.js",
      cwd: "/tmp/agent-cwd",
      exists: (path) => path === "/repo/apps/quant-backend/src/cli.ts",
      moduleUrl: "file:///repo/apps/cli/src/quant/runner/resolve-cli.ts",
    });
    expect(result).toEqual(["bun", "run", "/repo/apps/quant-backend/src/cli.ts"]);
  });

  test("prefers TONQUANT_QUANT_CLI env var", () => {
    const result = resolveQuantCliWithContext({
      env: {
        ...process.env,
        TONQUANT_QUANT_CLI: "python3 /path/to/cli.py",
      },
      exists: () => false,
    });
    expect(result).toEqual(["python3", "/path/to/cli.py"]);
  });

  test("keeps the public default resolver available", () => {
    const result = resolveQuantCli();
    expect(result[0]).toBe("bun");
    expect(result[1]).toBe("run");
  });
});

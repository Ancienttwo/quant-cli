#!/usr/bin/env bun

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const tempRoot = mkdtempSync(join(tmpdir(), "tonquant-pack-smoke-"));
const npmCacheDir = join(tempRoot, "npm-cache");
const packDir = join(tempRoot, "pack");
const installDir = join(tempRoot, "install");
const agentCwd = join(tempRoot, "agent-cwd");

mkdirSync(npmCacheDir, { recursive: true });
mkdirSync(packDir, { recursive: true });
mkdirSync(installDir, { recursive: true });
mkdirSync(agentCwd, { recursive: true });

function runChecked(cmd: string[], cwd: string, extraEnv?: Record<string, string>) {
  const result = Bun.spawnSync({
    cmd,
    cwd,
    env: {
      ...process.env,
      HOME: tempRoot,
      NPM_CONFIG_CACHE: npmCacheDir,
      ...extraEnv,
    },
    stderr: "pipe",
    stdout: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(
      [
        `Command failed: ${cmd.join(" ")}`,
        result.stdout.toString().trim(),
        result.stderr.toString().trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result.stdout.toString().trim();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

try {
  runChecked(["bun", "run", "build"], packageDir);

  const packJson = runChecked(
    ["npm", "pack", "--json", "--ignore-scripts", "--pack-destination", packDir],
    packageDir,
  );
  const packOutput = JSON.parse(packJson) as Array<{ filename?: string }>;
  const tarballName = packOutput.at(0)?.filename;
  assert(
    typeof tarballName === "string" && tarballName.length > 0,
    "npm pack did not return a tarball filename.",
  );

  const tarballPath = join(packDir, tarballName);
  const packedManifestText = runChecked(
    ["tar", "-xOf", tarballPath, "package/package.json"],
    packageDir,
  );
  const packedManifest = JSON.parse(packedManifestText) as {
    bin?: { tonquant?: string };
    files?: string[];
    dependencies?: Record<string, string>;
  };

  assert(
    packedManifest.bin?.tonquant === "./dist/index.js" ||
      packedManifest.bin?.tonquant === "dist/index.js",
    "Packed manifest did not point the tonquant bin at dist/index.js.",
  );
  assert(
    packedManifest.files?.includes("dist/index.js") &&
      packedManifest.files?.includes("dist/quant-backend.js"),
    "Packed manifest did not include both bundled runtime artifacts.",
  );
  assert(
    !Object.values(packedManifest.dependencies ?? {}).some((value) => value.includes("workspace:")),
    "Packed manifest still exposes a workspace runtime dependency.",
  );
  assert(
    !("@tonquant/core" in (packedManifest.dependencies ?? {})),
    "Packed manifest still exposes @tonquant/core as a runtime dependency.",
  );

  runChecked(["npm", "install", tarballPath], installDir);
  runChecked(["./node_modules/.bin/tonquant", "--help"], installDir);
  runChecked(["./node_modules/.bin/tonquant", "context", "--json"], installDir);
  runChecked(["./node_modules/.bin/tonquant", "research", "quote", "--help"], installDir);
  runChecked(["./node_modules/.bin/tonquant", "data", "list", "--json"], installDir);
  runChecked(["tonquant", "data", "list", "--json"], agentCwd, {
    PATH: `${join(installDir, "node_modules/.bin")}:${process.env.PATH ?? ""}`,
  });

  console.log(`Packed smoke verification passed: ${tarballPath}`);
} finally {
  rmSync(tempRoot, { force: true, recursive: true });
}

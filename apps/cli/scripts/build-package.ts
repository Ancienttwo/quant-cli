#!/usr/bin/env bun

import { mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "../..");
const distDir = join(packageDir, "dist");

const bundles = [
  {
    entry: join(packageDir, "src/index.ts"),
    label: "cli",
    outfile: join(distDir, "index.js"),
  },
  {
    entry: join(repoRoot, "apps/quant-backend/src/cli.ts"),
    label: "quant backend",
    outfile: join(distDir, "quant-backend.js"),
  },
];

rmSync(distDir, { force: true, recursive: true });
mkdirSync(distDir, { recursive: true });

for (const bundle of bundles) {
  const result = Bun.spawnSync({
    cmd: ["bun", "build", bundle.entry, "--outfile", bundle.outfile, "--target", "bun"],
    cwd: packageDir,
    stderr: "inherit",
    stdout: "inherit",
  });
  if (result.exitCode !== 0) {
    throw new Error(`Failed to build ${bundle.label} artifact.`);
  }
}

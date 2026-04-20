#!/usr/bin/env bun

import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const textExtensions = new Set([
  "",
  ".cjs",
  ".css",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sh",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const ignoredNames = new Set([".git", "coverage", "dist", "dist-pack", "node_modules"]);

const forbiddenPatterns = [
  {
    label: "source repo web path",
    regex: /apps\/web/g,
  },
  {
    label: "source repo platform API path",
    regex: /apps\/platform-api/g,
  },
  {
    label: "relative web path",
    regex: /\.\.\/(?:[^"'`\n]+\/)?web(?:\/|["'`])/g,
  },
  {
    label: "relative platform-api path",
    regex: /\.\.\/(?:[^"'`\n]+\/)?platform-api(?:\/|["'`])/g,
  },
];

function parseRepoRoot() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    return process.cwd();
  }
  if (args[0] !== "--repo-root") {
    throw new Error(`Unknown argument: ${args[0]}`);
  }
  return resolve(args[1] ?? process.cwd());
}

function shouldInspect(path: string) {
  return textExtensions.has(extname(path));
}

function walk(root: string, current: string, files: string[]) {
  const absolute = join(root, current);
  if (!existsSync(absolute)) {
    return;
  }

  const stat = lstatSync(absolute);
  if (stat.isDirectory()) {
    const name = current.split("/").at(-1) ?? current;
    if (ignoredNames.has(name)) {
      return;
    }
    for (const entry of readdirSync(absolute)) {
      walk(root, join(current, entry), files);
    }
    return;
  }

  if (shouldInspect(absolute)) {
    files.push(absolute);
  }
}

function main() {
  const repoRoot = parseRepoRoot();
  const rootsToInspect = [
    ".github",
    "README.md",
    "CONTRIBUTING.md",
    "docs",
    "package.json",
    "apps",
    "packages",
    "scripts",
  ];
  const files: string[] = [];
  for (const entry of rootsToInspect) {
    walk(repoRoot, entry, files);
  }

  const violations: string[] = [];
  for (const file of files) {
    const contents = readFileSync(file, "utf8");
    const lines = contents.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      for (const pattern of forbiddenPatterns) {
        if (pattern.regex.test(line)) {
          violations.push(
            `${relative(repoRoot, file)}:${index + 1} contains forbidden ${pattern.label}: ${line.trim()}`,
          );
        }
        pattern.regex.lastIndex = 0;
      }
    }
  }

  if (violations.length > 0) {
    console.error("quant-cli boundary check failed:");
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    process.exit(1);
  }

  console.log(`quant-cli boundary check passed for ${repoRoot}`);
}

main();

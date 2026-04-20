import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../../../..");

const contractFiles = [
  resolve(repoRoot, "skill/SKILL.md"),
  resolve(repoRoot, "scripts/demo.sh"),
  resolve(repoRoot, "demo/run.sh"),
  resolve(repoRoot, "demo/script.md"),
  resolve(repoRoot, "docs/tech-research.md"),
];

describe("CLI contract sync", () => {
  test("external docs and demo do not point users at removed CLI entrypoints", () => {
    const combined = contractFiles.map((path) => readFileSync(path, "utf8")).join("\n");

    expect(combined).not.toContain("tonquant price ");
    expect(combined).not.toContain("tonquant market ");
    expect(combined).not.toContain("### `price <symbol>`");
    expect(combined).not.toContain("### `research <symbol>`");
    expect(combined).not.toContain("autoresearch run --asset");
    expect(combined).toContain("tonquant research quote");
    expect(combined).toContain("tonquant research liquidity");
    expect(combined).toContain("tonquant autoresearch init");
    expect(combined).toContain("tonquant autoresearch run --track");
  });
});

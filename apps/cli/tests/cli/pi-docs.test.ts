import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../../../..");
const rootReadme = readFileSync(resolve(repoRoot, "README.md"), "utf8");
const cliReadme = readFileSync(resolve(repoRoot, "apps/cli/README.md"), "utf8");
const skillGuide = readFileSync(resolve(repoRoot, "skill/SKILL.md"), "utf8");
const piPackageReadme = readFileSync(
  resolve(repoRoot, "packages/pi-autoresearch/README.md"),
  "utf8",
);

describe("PI-first agent docs contract", () => {
  test("root docs recommend PI factor mining without redefining the CLI as OpenClaw-only", () => {
    expect(rootReadme).toContain("PI Factor Mining (Recommended)");
    expect(rootReadme).toContain("@mariozechner/pi-coding-agent");
    expect(rootReadme).toContain("git:github.com/davebcn87/pi-autoresearch");
    expect(rootReadme).toContain("@tonquant/pi-autoresearch");
    expect(rootReadme).toContain("tonquant autoresearch init");
    expect(rootReadme).toContain("tonquant autoresearch run --track <id>");
    expect(rootReadme).not.toContain("TonQuant is designed as an OpenClaw skill.");
    expect(rootReadme).not.toContain("tonquant autoresearch run --asset");
  });

  test("CLI README and skill guide stay framework-neutral", () => {
    expect(cliReadme).toContain("tonquant research quote --help");
    expect(cliReadme).toContain("tonquant autoresearch --help");
    expect(cliReadme).not.toContain("tonquant price --help");

    expect(skillGuide).toContain("Works from PI, OpenClaw, Claude Code");
    expect(skillGuide).toContain("Export top factors as agent skill definitions");
    expect(skillGuide).not.toContain("Export top factors as OpenClaw skill definitions");
  });

  test("PI package docs explain the separation from durable CLI autoresearch", () => {
    expect(piPackageReadme).toContain("does not replace `tonquant autoresearch`");
    expect(piPackageReadme).toContain("pi install git:github.com/davebcn87/pi-autoresearch");
    expect(piPackageReadme).toContain("pi install npm:@tonquant/pi-autoresearch");
    expect(piPackageReadme).toContain("/skill:tonquant-autoresearch-create");
    expect(piPackageReadme).toContain("tonquant autoresearch init|run|status|promote|reject");
  });
});

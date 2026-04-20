import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const packageDir = resolve(import.meta.dir, "..");
const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function runChecked(cmd: string[], cwd: string, extraEnv?: Record<string, string>): string {
  const result = Bun.spawnSync({
    cmd,
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ...extraEnv,
    },
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

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function prepareAutoreasonFixtureDir(fixtures: Record<string, unknown>): string {
  const dir = createTempDir("tonquant-pi-autoreason-");
  const incumbentPath = join(dir, "factor.json");
  const scratchDir = join(dir, ".autoreason");
  const fixturesPath = join(dir, "fixtures.json");
  const helperPath = join(dir, "mock-evaluate.js");

  mkdirSync(scratchDir, { recursive: true });
  writeFileSync(incumbentPath, "A\n", "utf8");
  writeFileSync(join(scratchDir, "candidate-b.json"), "B\n", "utf8");
  writeFileSync(join(scratchDir, "candidate-ab.json"), "AB\n", "utf8");
  writeFileSync(fixturesPath, JSON.stringify(fixtures), "utf8");
  writeFileSync(
    helperPath,
    [
      "const fs = require('node:fs');",
      "const fixtures = JSON.parse(fs.readFileSync(process.env.MOCK_FIXTURES, 'utf8'));",
      "const definitionFile = process.argv[2];",
      "const candidate = fs.readFileSync(definitionFile, 'utf8').trim();",
      "const fixture = fixtures[candidate];",
      "if (!fixture) throw new Error('Missing fixture for ' + candidate);",
      "const response = {",
      "  status: 'ok',",
      "  data: {",
      "    evaluation: {",
      "      metrics: {",
      "        factorQuality: {",
      "          rankIcOosIcir: fixture.rankIcOosIcir,",
      "          rankIcOosMean: fixture.rankIcOosMean,",
      "          rankIcOosTstat: fixture.rankIcOosTstat,",
      "          quantileSpreadQ5Q1: fixture.quantileSpreadQ5Q1,",
      "        },",
      "        implementationProfile: {",
      "          turnoverTwoWay: fixture.turnoverTwoWay,",
      "          peerCorrelation: { maxAbs: fixture.peerCorrelationMaxAbs },",
      "        },",
      "      },",
      "      provenance: {",
      "        sampleCount: fixture.sampleCount,",
      "        averageUniverseSize: fixture.averageUniverseSize,",
      "        evaluationFrequency: fixture.evaluationFrequency || 'daily',",
      "      },",
      "    },",
      "  },",
      "};",
      "process.stdout.write(JSON.stringify(response));",
    ].join("\n"),
    "utf8",
  );

  return dir;
}

function runAutoreasonTemplate(dir: string): {
  stdout: string;
  incumbent: string;
  state: { consecutiveIncumbentWins?: number; lastWinner?: string };
  stopReason: string | null;
} {
  const incumbentPath = join(dir, "factor.json");
  const scratchDir = join(dir, ".autoreason");
  const fixturesPath = join(dir, "fixtures.json");
  const helperPath = join(dir, "mock-evaluate.js");
  const templatePath = join(packageDir, "templates", "autoresearch.autoreason.sh");

  const stdout = runChecked(["bash", templatePath], packageDir, {
    MOCK_FIXTURES: fixturesPath,
    TONQUANT_EVALUATE_CMD_TEMPLATE: `node "${helperPath}" {definition_file}`,
    TONQUANT_AUTOREASON_INCUMBENT_FILE: incumbentPath,
    TONQUANT_AUTOREASON_SCRATCH_DIR: scratchDir,
  });
  const statePath = join(scratchDir, "judge-state.json");
  const stopPath = join(scratchDir, "stop-reason.txt");

  return {
    stdout,
    incumbent: readFileSync(incumbentPath, "utf8").trim(),
    state: JSON.parse(readFileSync(statePath, "utf8")) as {
      consecutiveIncumbentWins?: number;
      lastWinner?: string;
    },
    stopReason: existsSync(stopPath) ? readFileSync(stopPath, "utf8").trim() : null,
  };
}

describe("@tonquant/pi-autoresearch package", () => {
  test("manifest exposes pi metadata and package files", () => {
    const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
      name: string;
      keywords?: string[];
      files?: string[];
      pi?: { skills?: string[] };
    };

    expect(manifest.name).toBe("@tonquant/pi-autoresearch");
    expect(manifest.keywords).toContain("pi-package");
    expect(manifest.files).toContain("README.md");
    expect(manifest.files).toContain("skills");
    expect(manifest.files).toContain("templates");
    expect(manifest.pi?.skills).toEqual(["./skills"]);
  });

  test("npm pack includes PI assets and excludes the main CLI runtime", () => {
    const packDir = createTempDir("tonquant-pi-pack-");
    const packJson = runChecked(
      ["npm", "pack", "--json", "--ignore-scripts", "--pack-destination", packDir],
      packageDir,
    );
    const packOutput = JSON.parse(packJson) as Array<{ filename?: string }>;
    const tarballName = packOutput.at(0)?.filename;

    expect(typeof tarballName).toBe("string");
    if (!tarballName) {
      throw new Error("Expected npm pack to return a tarball name.");
    }

    const tarballPath = join(packDir, tarballName);
    const tarList = runChecked(["tar", "-tf", tarballPath], packageDir);

    expect(tarList).toContain("package/README.md");
    expect(tarList).toContain("package/skills/tonquant-autoresearch-create/SKILL.md");
    expect(tarList).toContain("package/templates/autoresearch.sh");
    expect(tarList).toContain("package/templates/autoresearch.autoreason.md");
    expect(tarList).toContain("package/templates/autoresearch.autoreason.sh");
    expect(tarList).toContain("package/templates/autoresearch.checks.sh");
    expect(tarList).not.toContain("package/dist/index.js");
    expect(tarList).not.toContain("package/apps/cli/");
  });

  test("benchmark template emits parseable TonQuant metrics", () => {
    const templatePath = join(packageDir, "templates", "autoresearch.sh");
    const stdout = runChecked(["bash", templatePath], packageDir, {
      TONQUANT_EVALUATE_CMD:
        "node -e 'process.stdout.write(JSON.stringify({status:\"ok\",data:{evaluation:{metrics:{factorQuality:{rankIcOosIcir:1.23,rankIcOosMean:0.034,rankIcOosTstat:2.4,quantileSpreadQ5Q1:0.012},implementationProfile:{turnoverTwoWay:0.21,peerCorrelation:{maxAbs:0.28}}}}}}))'",
    });

    expect(stdout).toContain("METRIC rankIcOosIcir=1.23");
    expect(stdout).toContain("METRIC rankIcOosMean=0.034");
    expect(stdout).toContain("METRIC rankIcOosTstat=2.4");
    expect(stdout).toContain("METRIC quantileSpreadQ5Q1=0.012");
    expect(stdout).toContain("METRIC turnoverTwoWay=0.21");
    expect(stdout).toContain("METRIC peerCorrelationMaxAbs=0.28");
  });

  test("autoreason template keeps the incumbent when challengers fail and stops after two incumbent wins", () => {
    const fixtures = {
      A: {
        rankIcOosIcir: 1.0,
        rankIcOosMean: 0.03,
        rankIcOosTstat: 2.3,
        quantileSpreadQ5Q1: 0.012,
        turnoverTwoWay: 0.2,
        peerCorrelationMaxAbs: 0.2,
        sampleCount: 252,
        averageUniverseSize: 80,
      },
      B: {
        rankIcOosIcir: 1.12,
        rankIcOosMean: 0.035,
        rankIcOosTstat: 2.5,
        quantileSpreadQ5Q1: 0.013,
        turnoverTwoWay: 0.21,
        peerCorrelationMaxAbs: 0.21,
        sampleCount: 100,
        averageUniverseSize: 80,
      },
      AB: {
        rankIcOosIcir: 1.08,
        rankIcOosMean: 0.033,
        rankIcOosTstat: 2.4,
        quantileSpreadQ5Q1: 0.013,
        turnoverTwoWay: 0.27,
        peerCorrelationMaxAbs: 0.24,
        sampleCount: 252,
        averageUniverseSize: 80,
      },
    };

    const dir = prepareAutoreasonFixtureDir(fixtures);
    const first = runAutoreasonTemplate(dir);
    expect(first.stdout).toContain("WINNER A");
    expect(first.incumbent).toBe("A");
    expect(first.state.consecutiveIncumbentWins).toBe(1);
    expect(first.stopReason).toBeNull();

    const second = runAutoreasonTemplate(dir);
    expect(second.stdout).toContain("WINNER A");
    expect(second.stdout).toContain("AUTOREASON_STOP incumbent-won-twice");
    expect(second.incumbent).toBe("A");
    expect(second.state.consecutiveIncumbentWins).toBe(2);
    expect(second.stopReason).toBe("incumbent-won-twice");
  });

  test("autoreason template promotes B when it clears the objective gates", () => {
    const result = runAutoreasonTemplate(
      prepareAutoreasonFixtureDir({
        A: {
          rankIcOosIcir: 1.0,
          rankIcOosMean: 0.03,
          rankIcOosTstat: 2.3,
          quantileSpreadQ5Q1: 0.012,
          turnoverTwoWay: 0.2,
          peerCorrelationMaxAbs: 0.2,
          sampleCount: 252,
          averageUniverseSize: 80,
        },
        B: {
          rankIcOosIcir: 1.05,
          rankIcOosMean: 0.034,
          rankIcOosTstat: 2.6,
          quantileSpreadQ5Q1: 0.014,
          turnoverTwoWay: 0.22,
          peerCorrelationMaxAbs: 0.23,
          sampleCount: 252,
          averageUniverseSize: 80,
        },
        AB: {
          rankIcOosIcir: 1.03,
          rankIcOosMean: 0.032,
          rankIcOosTstat: 2.4,
          quantileSpreadQ5Q1: 0.013,
          turnoverTwoWay: 0.21,
          peerCorrelationMaxAbs: 0.22,
          sampleCount: 252,
          averageUniverseSize: 80,
        },
      }),
    );

    expect(result.stdout).toContain("WINNER B");
    expect(result.incumbent).toBe("B");
    expect(result.state.lastWinner).toBe("B");
    expect(result.state.consecutiveIncumbentWins).toBe(0);
    expect(result.stopReason).toBeNull();
  });

  test("autoreason template prefers AB when B violates guardrails", () => {
    const result = runAutoreasonTemplate(
      prepareAutoreasonFixtureDir({
        A: {
          rankIcOosIcir: 1.0,
          rankIcOosMean: 0.03,
          rankIcOosTstat: 2.3,
          quantileSpreadQ5Q1: 0.012,
          turnoverTwoWay: 0.2,
          peerCorrelationMaxAbs: 0.2,
          sampleCount: 252,
          averageUniverseSize: 80,
        },
        B: {
          rankIcOosIcir: 1.08,
          rankIcOosMean: 0.036,
          rankIcOosTstat: 2.7,
          quantileSpreadQ5Q1: 0.015,
          turnoverTwoWay: 0.26,
          peerCorrelationMaxAbs: 0.27,
          sampleCount: 252,
          averageUniverseSize: 80,
        },
        AB: {
          rankIcOosIcir: 1.04,
          rankIcOosMean: 0.033,
          rankIcOosTstat: 2.5,
          quantileSpreadQ5Q1: 0.014,
          turnoverTwoWay: 0.21,
          peerCorrelationMaxAbs: 0.22,
          sampleCount: 252,
          averageUniverseSize: 80,
        },
      }),
    );

    expect(result.stdout).toContain("WINNER AB");
    expect(result.incumbent).toBe("AB");
    expect(result.state.lastWinner).toBe("AB");
  });

  test("checks template keeps repo gates but skips autoresearch-only edits", () => {
    const template = readFileSync(join(packageDir, "templates", "autoresearch.checks.sh"), "utf8");

    expect(template).toContain("git status --short");
    expect(template).toContain("No tracked code changes outside autoresearch session files");
    expect(template).toContain("bun typecheck");
    expect(template).toContain("bun lint");
    expect(template).toContain("bun test --max-concurrency 1 --path-ignore-patterns '_ref/**'");
  });
});

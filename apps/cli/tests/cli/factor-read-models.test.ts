import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { makeFactor } from "../../../../packages/core/tests/helpers/factor-fixtures.js";

const repoRoot = resolve(import.meta.dir, "../../../..");
const cliEntry = resolve(repoRoot, "apps/cli/src/index.ts");
const decoder = new TextDecoder();
const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function runCli(args: string[], homeDir: string) {
  return Bun.spawnSync({
    cmd: [process.execPath, cliEntry, ...args],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      HOME: homeDir,
    },
  });
}

function writeEvaluationArtifact(root: string, fileName: string): string {
  const factor = makeFactor("phase1c_read_models");
  const filePath = join(root, fileName);
  writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        definition: factor.definition,
        metrics: factor.metrics,
        provenance: factor.provenance,
        referenceBacktest: factor.referenceBacktest,
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
  return filePath;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("factor read models", () => {
  test("ic, decay, and uniqueness commands expose local factor summaries", () => {
    const homeDir = createTempDir("tonquant-factor-read-home-");
    const workDir = createTempDir("tonquant-factor-read-work-");
    const evaluationPath = writeEvaluationArtifact(workDir, "factor-evaluation.json");

    const publish = runCli(
      [
        "--json",
        "factor",
        "publish",
        "--name",
        "Phase1C Read Models",
        "--category",
        "momentum",
        "--evaluation-file",
        evaluationPath,
      ],
      homeDir,
    );
    expect(publish.exitCode).toBe(0);

    const ic = runCli(["--json", "factor", "ic", "phase1c_read_models"], homeDir);
    expect(ic.exitCode).toBe(0);
    const icPayload = JSON.parse(decoder.decode(ic.stdout)) as {
      status: string;
      data: { factorId: string; rankIcOosIcir: number; nTrials?: number };
    };
    expect(icPayload.status).toBe("ok");
    expect(icPayload.data.factorId).toBe("phase1c_read_models");
    expect(icPayload.data.rankIcOosIcir).toBeGreaterThan(0);
    expect(icPayload.data.nTrials).toBe(1);

    const decay = runCli(["--json", "factor", "decay", "phase1c_read_models"], homeDir);
    expect(decay.exitCode).toBe(0);
    const decayPayload = JSON.parse(decoder.decode(decay.stdout)) as {
      status: string;
      data: { decay: Array<{ horizon: string }>; factorId: string };
    };
    expect(decayPayload.status).toBe("ok");
    expect(decayPayload.data.factorId).toBe("phase1c_read_models");
    expect(decayPayload.data.decay.length).toBeGreaterThan(0);

    const uniqueness = runCli(["--json", "factor", "uniqueness", "phase1c_read_models"], homeDir);
    expect(uniqueness.exitCode).toBe(0);
    const uniquenessPayload = JSON.parse(decoder.decode(uniqueness.stdout)) as {
      status: string;
      data: { factorId: string; peerCorrelation: { bucket: string } };
    };
    expect(uniquenessPayload.status).toBe("ok");
    expect(uniquenessPayload.data.factorId).toBe("phase1c_read_models");
    expect(uniquenessPayload.data.peerCorrelation.bucket).toBe("unique");
  });
});

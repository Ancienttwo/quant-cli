import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  buildSigningSession,
  normalizeTonAddress,
  PreparedPlatformActionSchema,
} from "@tonquant/core";
import { makeFactor } from "../../../../packages/core/tests/helpers/factor-fixtures.js";

const repoRoot = resolve(import.meta.dir, "../../../..");
const cliEntry = resolve(repoRoot, "apps/cli/src/index.ts");
const decoder = new TextDecoder();
const tempDirs: string[] = [];
const publisherAddress = normalizeTonAddress(`0:${"1".repeat(64)}`);

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

function readStream(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) {
    return Promise.resolve("");
  }

  return (async () => {
    const reader = stream.getReader();
    let output = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      output += decoder.decode(value);
    }
    return output;
  })();
}

function spawnCli(args: string[], homeDir: string) {
  const proc = Bun.spawn({
    cmd: [process.execPath, cliEntry, ...args],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      HOME: homeDir,
    },
  });

  return {
    proc,
    stdout: readStream(proc.stdout),
    stderr: readStream(proc.stderr),
  };
}

function writeEvaluationArtifact(
  root: string,
  fileName: string,
  artifact: Record<string, unknown>,
): string {
  const filePath = join(root, fileName);
  writeFileSync(filePath, `${JSON.stringify(artifact, null, 2)}\n`, "utf-8");
  return filePath;
}

function writeArtifactBundle(root: string, fileName: string): string {
  const filePath = join(root, fileName);
  writeFileSync(filePath, "paid artifact fixture\n", "utf-8");
  return filePath;
}

function makeEvaluationArtifact() {
  const factor = makeFactor("phase1a_contract_factor");
  return {
    definition: factor.definition,
    metrics: factor.metrics,
    provenance: factor.provenance,
    referenceBacktest: factor.referenceBacktest,
  };
}

function makeIncompleteEvaluationArtifact() {
  const artifact = makeEvaluationArtifact();
  const factorQuality = { ...artifact.metrics.factorQuality };
  delete factorQuality.deflatedRankIc;
  delete factorQuality.nTrials;

  return {
    ...artifact,
    metrics: {
      ...artifact.metrics,
      factorQuality,
    },
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("factor marketplace Phase-1A gates", () => {
  test("factor publish rejects incomplete factor-quality artifacts", () => {
    const homeDir = createTempDir("tonquant-factor-publish-home-");
    const workDir = createTempDir("tonquant-factor-publish-work-");
    const evaluationPath = writeEvaluationArtifact(
      workDir,
      "incomplete-evaluation.json",
      makeIncompleteEvaluationArtifact(),
    );

    const result = runCli(
      [
        "--json",
        "factor",
        "publish",
        "--name",
        "Phase1A Publish Reject",
        "--category",
        "momentum",
        "--evaluation-file",
        evaluationPath,
      ],
      homeDir,
    );

    expect(result.exitCode).toBe(1);
    const stderr = JSON.parse(decoder.decode(result.stderr)) as {
      status: string;
      code: string;
      error: string;
    };
    expect(stderr.status).toBe("error");
    expect(stderr.code).toBe("METRIC_INCOMPLETE");
    expect(stderr.error).toContain("deflatedRankIc");
    expect(stderr.error).toContain("nTrials");
  });

  test("factor publish and publish-prepare accept halfLifeDays=null when the other fields are present", () => {
    const homeDir = createTempDir("tonquant-factor-prepare-home-");
    const workDir = createTempDir("tonquant-factor-prepare-work-");
    const evaluationPath = writeEvaluationArtifact(
      workDir,
      "complete-evaluation.json",
      makeEvaluationArtifact(),
    );
    const artifactPath = writeArtifactBundle(workDir, "factor-bundle.tgz");
    const preparedPath = join(workDir, "prepared.json");

    const publishResult = runCli(
      [
        "--json",
        "factor",
        "publish",
        "--name",
        "Phase1A Ready Factor",
        "--category",
        "momentum",
        "--evaluation-file",
        evaluationPath,
      ],
      homeDir,
    );

    expect(publishResult.exitCode).toBe(0);

    const prepareResult = runCli(
      [
        "--json",
        "factor",
        "publish-prepare",
        "phase1a_ready_factor",
        "--evaluation-file",
        evaluationPath,
        "--artifact-bundle",
        artifactPath,
        "--price-ton",
        "3.5",
        "--duration-days",
        "30",
        "--publisher-address",
        publisherAddress,
        "--output",
        preparedPath,
      ],
      homeDir,
    );

    expect(prepareResult.exitCode).toBe(0);
    const stdout = JSON.parse(decoder.decode(prepareResult.stdout)) as {
      status: string;
      data: { outputPath?: string };
    };
    expect(stdout.status).toBe("ok");
    expect(stdout.data.outputPath).toBe(preparedPath);
    expect(existsSync(preparedPath)).toBe(true);
  });

  test("publish-prepare rejects incomplete evaluation artifacts before registry mismatch", () => {
    const homeDir = createTempDir("tonquant-factor-prepare-reject-home-");
    const workDir = createTempDir("tonquant-factor-prepare-reject-work-");
    const completeEvaluationPath = writeEvaluationArtifact(
      workDir,
      "complete-evaluation.json",
      makeEvaluationArtifact(),
    );
    const incompleteEvaluationPath = writeEvaluationArtifact(
      workDir,
      "incomplete-evaluation.json",
      makeIncompleteEvaluationArtifact(),
    );
    const artifactPath = writeArtifactBundle(workDir, "factor-bundle.tgz");

    const publishResult = runCli(
      [
        "--json",
        "factor",
        "publish",
        "--name",
        "Phase1A Reject Prepare",
        "--category",
        "momentum",
        "--evaluation-file",
        completeEvaluationPath,
      ],
      homeDir,
    );
    expect(publishResult.exitCode).toBe(0);

    const prepareResult = runCli(
      [
        "--json",
        "factor",
        "publish-prepare",
        "phase1a_reject_prepare",
        "--evaluation-file",
        incompleteEvaluationPath,
        "--artifact-bundle",
        artifactPath,
        "--price-ton",
        "3.5",
        "--duration-days",
        "30",
        "--publisher-address",
        publisherAddress,
      ],
      homeDir,
    );

    expect(prepareResult.exitCode).toBe(1);
    const stderr = JSON.parse(decoder.decode(prepareResult.stderr)) as {
      status: string;
      code: string;
      error: string;
    };
    expect(stderr.status).toBe("error");
    expect(stderr.code).toBe("METRIC_INCOMPLETE");
    expect(stderr.error).toContain("Evaluation artifact");
    expect(stderr.error).not.toContain("does not match the current registry entry");
  });

  test("publish-request-signature uploads the staged artifact bundle before returning the signing session", async () => {
    const homeDir = createTempDir("tonquant-factor-signature-home-");
    const workDir = createTempDir("tonquant-factor-signature-work-");
    const evaluationPath = writeEvaluationArtifact(
      workDir,
      "complete-evaluation.json",
      makeEvaluationArtifact(),
    );
    const artifactPath = writeArtifactBundle(workDir, "factor-bundle.tgz");
    const preparedPath = join(workDir, "prepared.json");
    const uploads: Array<{
      sessionId: string;
      fileName: string;
      bundleSha256: string;
      sizeBytes: string;
      body: string;
    }> = [];

    let origin = "";
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: async (request) => {
        const url = new URL(request.url);

        if (request.method === "POST" && url.pathname === "/v1/wallet/nonce") {
          const prepared = PreparedPlatformActionSchema.parse(await request.json());
          const sessionId = "session_cli_upload";
          const now = new Date("2026-04-20T01:00:00.000Z").toISOString();
          const session = buildSigningSession({
            prepared,
            nonce: "nonce_cli_upload",
            sessionId,
            issuedAt: now,
            expiresAt: new Date("2026-04-20T01:10:00.000Z").toISOString(),
            signUrl: `${origin}/sign?session=${sessionId}`,
            artifactUploadUrl: `${origin}/v1/signing-sessions/${sessionId}/artifact`,
          });

          return new Response(JSON.stringify({ status: "ok", data: session }), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        }

        const uploadMatch = url.pathname.match(/^\/v1\/signing-sessions\/([^/]+)\/artifact$/u);
        if (request.method === "PUT" && uploadMatch) {
          uploads.push({
            sessionId: uploadMatch[1] ?? "",
            fileName: request.headers.get("x-tonquant-bundle-file-name") ?? "",
            bundleSha256: request.headers.get("x-tonquant-bundle-sha256") ?? "",
            sizeBytes: request.headers.get("x-tonquant-bundle-size") ?? "",
            body: Buffer.from(await request.arrayBuffer()).toString("utf-8"),
          });

          return new Response("", { status: 200 });
        }

        return new Response(
          JSON.stringify({
            status: "error",
            error: "Route not found.",
            code: "TEST_ROUTE_NOT_FOUND",
          }),
          {
            status: 404,
            headers: { "content-type": "application/json; charset=utf-8" },
          },
        );
      },
    });
    origin = `http://127.0.0.1:${server.port}`;

    try {
      const publishResult = runCli(
        [
          "--json",
          "factor",
          "publish",
          "--name",
          "Phase1A Signature Upload",
          "--category",
          "momentum",
          "--evaluation-file",
          evaluationPath,
        ],
        homeDir,
      );
      expect(publishResult.exitCode).toBe(0);

      const prepareResult = runCli(
        [
          "--json",
          "factor",
          "publish-prepare",
          "phase1a_signature_upload",
          "--evaluation-file",
          evaluationPath,
          "--artifact-bundle",
          artifactPath,
          "--price-ton",
          "3.5",
          "--duration-days",
          "30",
          "--publisher-address",
          publisherAddress,
          "--output",
          preparedPath,
        ],
        homeDir,
      );
      expect(prepareResult.exitCode).toBe(0);

      const command = spawnCli(
        [
          "--json",
          "factor",
          "publish-request-signature",
          "--prepared-file",
          preparedPath,
          "--platform-url",
          origin,
        ],
        homeDir,
      );

      const exitCode = await command.proc.exited;
      const stdout = await command.stdout;
      const stderr = await command.stderr;

      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
      expect(uploads).toHaveLength(1);

      const upload = uploads[0];
      if (!upload) {
        throw new Error("Expected one artifact upload.");
      }

      expect(upload.sessionId).toBe("session_cli_upload");
      expect(upload.fileName).toBe("factor-bundle.tgz");
      expect(upload.sizeBytes).toBe(String(readFileSync(artifactPath).byteLength));
      expect(upload.body).toBe(readFileSync(artifactPath, "utf-8"));

      const payload = JSON.parse(stdout) as {
        status: string;
        data: { sessionId: string; artifactUploadUrl?: string };
      };
      expect(payload.status).toBe("ok");
      expect(payload.data.sessionId).toBe("session_cli_upload");
      expect(payload.data.artifactUploadUrl).toBe(
        `${origin}/v1/signing-sessions/session_cli_upload/artifact`,
      );
    } finally {
      server.stop(true);
    }
  });
});

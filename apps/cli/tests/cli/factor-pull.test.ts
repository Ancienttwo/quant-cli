import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../../../..");
const cliEntry = resolve(repoRoot, "apps/cli/src/index.ts");
const decoder = new TextDecoder();
const tempDirs: string[] = [];
const DEFAULT_ARTIFACT_BYTES = Buffer.from("tonquant-paid-pull-fixture", "utf-8");
const RAW_TREASURY_ADDRESS = `0:${"1".repeat(64)}`;

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function createFakeBrowserOpenBin(): string {
  const dir = createTempDir("tonquant-factor-pull-bin-");
  const script = "#!/bin/sh\nexit 0\n";
  for (const name of ["open", "xdg-open"]) {
    const path = join(dir, name);
    writeFileSync(path, script, { mode: 0o755 });
    chmodSync(path, 0o755);
  }
  return dir;
}

function readStream(
  stream: ReadableStream<Uint8Array> | null,
  onChunk?: (chunk: string, aggregate: string) => void,
): Promise<string> {
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
      const chunk = decoder.decode(value);
      output += chunk;
      onChunk?.(chunk, output);
    }
    return output;
  })();
}

function spawnCli(
  args: string[],
  envOverrides: Record<string, string | undefined> = {},
  onStdoutChunk?: (chunk: string, aggregate: string) => void,
  onStderrChunk?: (chunk: string, aggregate: string) => void,
) {
  const fakeBrowserBin = createFakeBrowserOpenBin();
  const proc = Bun.spawn({
    cmd: [process.execPath, cliEntry, ...args],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      HOME: createTempDir("tonquant-factor-pull-home-"),
      // Prevent integration tests from launching a real browser while keeping the
      // happy-path "open succeeded" behavior intact.
      PATH: [fakeBrowserBin, process.env.PATH].filter(Boolean).join(delimiter),
      ...envOverrides,
    },
  });

  return {
    proc,
    stdout: readStream(proc.stdout, onStdoutChunk),
    stderr: readStream(proc.stderr, onStderrChunk),
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out.`)), timeoutMs);
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

interface FakePlatformServerOptions {
  grantBytes?: Uint8Array;
  downloadBytes?: Uint8Array;
}

interface PullSessionState {
  pullSessionId: string;
  factorSlug: string;
  callbackUrl: string;
  checkoutUrl: string;
  code: string;
  token: string;
  grantId: string;
  subscriptionId: string;
  bundleFileName: string;
  bundleSha256: string;
  sizeBytes: number;
}

function createFakePlatformServer(options: FakePlatformServerOptions = {}) {
  const grantBytes = options.grantBytes ?? DEFAULT_ARTIFACT_BYTES;
  const downloadBytes = options.downloadBytes ?? grantBytes;
  const pullSessionDeferred = deferred<PullSessionState>();
  let sessionSequence = 0;
  let origin = "";
  const sessions = new Map<string, PullSessionState>();

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const url = new URL(request.url);

      if (request.method === "POST" && url.pathname === "/v1/pull-sessions") {
        const body = (await request.json()) as { factorSlug: string; callbackUrl: string };
        sessionSequence += 1;
        const pullSessionId = `pull_${sessionSequence}`;
        const code = `code_${sessionSequence}`;
        const token = `dl_${sessionSequence}`;
        const grantId = `grant_${sessionSequence}`;
        const subscriptionId = `sub_${sessionSequence}`;
        const checkoutUrl = `${origin}/checkout?pull=${encodeURIComponent(pullSessionId)}`;
        const session: PullSessionState = {
          pullSessionId,
          factorSlug: body.factorSlug,
          callbackUrl: body.callbackUrl,
          checkoutUrl,
          code,
          token,
          grantId,
          subscriptionId,
          bundleFileName: `${body.factorSlug}.tgz`,
          bundleSha256: sha256Hex(grantBytes),
          sizeBytes: grantBytes.byteLength,
        };
        sessions.set(pullSessionId, session);
        pullSessionDeferred.resolve(session);

        return new Response(
          JSON.stringify({
            status: "ok",
            data: {
              pullSessionId,
              factorSlug: body.factorSlug,
              factorVersion: "1.0.0",
              publicationId: `pub_${sessionSequence}`,
              callbackUrl: body.callbackUrl,
              checkoutUrl,
              paymentRecipient: RAW_TREASURY_ADDRESS,
              recipientFriendlyAddress: "UQTONQUANTTREASURYFAKEADDRESS",
              commercial: {
                tierLabel: "standard",
                durationDays: 30,
                priceTon: "3.5",
                platformFeeBps: 1500,
              },
              priceNano: "3500000000",
              paymentReference: `tonquant:pull:${pullSessionId}`,
              payloadBase64: Buffer.from(`payload:${pullSessionId}`, "utf-8").toString("base64"),
              status: "pending_payment",
              expiresAt: "2026-04-20T01:10:00.000Z",
              createdAt: "2026-04-20T01:00:00.000Z",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          },
        );
      }

      if (request.method === "POST" && url.pathname === "/v1/pull-sessions/exchange") {
        const body = (await request.json()) as { pullSessionId: string; code: string };
        const session = sessions.get(body.pullSessionId);
        if (!session || body.code !== session.code) {
          return new Response(
            JSON.stringify({
              status: "error",
              error: "Pull session exchange code is invalid.",
              code: "PLATFORM_PULL_CODE_INVALID",
            }),
            {
              status: 400,
              headers: { "content-type": "application/json; charset=utf-8" },
            },
          );
        }

        return new Response(
          JSON.stringify({
            status: "ok",
            data: {
              grantId: session.grantId,
              subscriptionId: session.subscriptionId,
              factorSlug: session.factorSlug,
              factorVersion: "1.0.0",
              bundleFileName: session.bundleFileName,
              bundleSha256: session.bundleSha256,
              sizeBytes: session.sizeBytes,
              downloadUrl: `${origin}/downloads/${encodeURIComponent(session.pullSessionId)}`,
              token: session.token,
              expiresAt: "2026-04-20T01:05:00.000Z",
              createdAt: "2026-04-20T01:01:00.000Z",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          },
        );
      }

      const downloadMatch = url.pathname.match(/^\/downloads\/([^/]+)$/u);
      if (request.method === "GET" && downloadMatch) {
        const session = sessions.get(decodeURIComponent(downloadMatch[1] ?? ""));
        const bearer = request.headers.get("authorization")?.replace(/^Bearer /u, "");
        if (!session || bearer !== session.token) {
          return new Response("unauthorized", { status: 401 });
        }
        return new Response(downloadBytes, {
          status: 200,
          headers: {
            "content-type": "application/octet-stream",
            "x-tonquant-bundle-sha256": session.bundleSha256,
          },
        });
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

  return {
    origin,
    async waitForPullSession(): Promise<PullSessionState> {
      return await withTimeout(pullSessionDeferred.promise, 2_000, "pull session");
    },
    async postCallback(params: { actualSessionId: string; callbackSessionId?: string }) {
      const session = sessions.get(params.actualSessionId);
      if (!session) {
        throw new Error(`Unknown session ${params.actualSessionId}.`);
      }

      const response = await fetch(session.callbackUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pullSessionId: params.callbackSessionId ?? session.pullSessionId,
          code: session.code,
        }),
      });
      expect(response.status).toBe(params.callbackSessionId ? 200 : 200);
    },
    close() {
      server.stop(true);
    },
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("factor pull", () => {
  test("pulls the paid artifact bundle through loopback callback and verifies the hash", async () => {
    const outputDir = createTempDir("tonquant-factor-pull-output-");
    const platform = createFakePlatformServer();

    try {
      const command = spawnCli([
        "--json",
        "factor",
        "pull",
        "paid_alpha",
        "--output-dir",
        outputDir,
        "--platform-url",
        platform.origin,
        "--timeout-ms",
        "5000",
      ]);

      const session = await platform.waitForPullSession();
      await platform.postCallback({ actualSessionId: session.pullSessionId });

      const exitCode = await command.proc.exited;
      const stdout = await command.stdout;
      const stderr = await command.stderr;

      expect(exitCode).toBe(0);
      expect(stderr).toBe("");

      const payload = JSON.parse(stdout) as {
        status: string;
        data: { outputPath: string; bundleSha256: string };
      };
      expect(payload.status).toBe("ok");
      expect(payload.data.bundleSha256).toBe(sha256Hex(DEFAULT_ARTIFACT_BYTES));
      expect(payload.data.outputPath).toBe(join(outputDir, "paid_alpha.tgz"));
      expect(existsSync(payload.data.outputPath)).toBe(true);
      expect(readFileSync(payload.data.outputPath).equals(DEFAULT_ARTIFACT_BYTES)).toBe(true);
    } finally {
      platform.close();
    }
  });

  test("prints the checkout URL in human mode when auto-open fails before waiting for the callback", async () => {
    const outputDir = createTempDir("tonquant-factor-pull-human-output-");
    const platform = createFakePlatformServer();
    const checkoutHintSeen = deferred<void>();
    let stderrBuffer = "";

    try {
      const command = spawnCli(
        [
          "factor",
          "pull",
          "paid_beta",
          "--output-dir",
          outputDir,
          "--platform-url",
          platform.origin,
          "--timeout-ms",
          "5000",
        ],
        {
          PATH: "/nonexistent",
          TONQUANT_DISABLE_BROWSER_OPEN: "1",
        },
        undefined,
        (_chunk, aggregate) => {
          stderrBuffer = aggregate;
          if (aggregate.includes("Open this checkout URL to continue payment:")) {
            checkoutHintSeen.resolve();
          }
        },
      );

      const session = await platform.waitForPullSession();
      await withTimeout(checkoutHintSeen.promise, 2_000, "checkout hint");
      expect(stderrBuffer).toContain(session.checkoutUrl);

      await platform.postCallback({ actualSessionId: session.pullSessionId });

      const exitCode = await command.proc.exited;
      const stdout = await command.stdout;
      const stderr = await command.stderr;

      expect(exitCode).toBe(0);
      expect(stderr).toContain("Open this checkout URL to continue payment:");
      expect(stderr).toContain(session.checkoutUrl);
      expect(stdout).toContain("Pulled paid artifact for paid_beta@1.0.0");
    } finally {
      platform.close();
    }
  });

  test("prints the checkout URL to stderr in json mode when auto-open fails", async () => {
    const outputDir = createTempDir("tonquant-factor-pull-json-output-");
    const platform = createFakePlatformServer();
    const checkoutHintSeen = deferred<void>();
    let stderrBuffer = "";

    try {
      const command = spawnCli(
        [
          "--json",
          "factor",
          "pull",
          "paid_json",
          "--output-dir",
          outputDir,
          "--platform-url",
          platform.origin,
          "--timeout-ms",
          "5000",
        ],
        {
          PATH: "/nonexistent",
          TONQUANT_DISABLE_BROWSER_OPEN: "1",
        },
        undefined,
        (_chunk, aggregate) => {
          stderrBuffer = aggregate;
          if (aggregate.includes("Open this checkout URL to continue payment:")) {
            checkoutHintSeen.resolve();
          }
        },
      );

      const session = await platform.waitForPullSession();
      await withTimeout(checkoutHintSeen.promise, 2_000, "json checkout hint");
      expect(stderrBuffer).toContain(session.checkoutUrl);

      await platform.postCallback({ actualSessionId: session.pullSessionId });

      const exitCode = await command.proc.exited;
      const stdout = await command.stdout;
      const stderr = await command.stderr;

      expect(exitCode).toBe(0);
      expect(stderr).toContain(session.checkoutUrl);

      const payload = JSON.parse(stdout) as {
        status: string;
        data: { checkoutUrl: string };
      };
      expect(payload.status).toBe("ok");
      expect(payload.data.checkoutUrl).toBe(session.checkoutUrl);
    } finally {
      platform.close();
    }
  });

  test("fails when the loopback callback returns a mismatched pull session id", async () => {
    const outputDir = createTempDir("tonquant-factor-pull-mismatch-output-");
    const platform = createFakePlatformServer();

    try {
      const command = spawnCli([
        "--json",
        "factor",
        "pull",
        "paid_gamma",
        "--output-dir",
        outputDir,
        "--platform-url",
        platform.origin,
        "--timeout-ms",
        "5000",
      ]);

      const session = await platform.waitForPullSession();
      await platform.postCallback({
        actualSessionId: session.pullSessionId,
        callbackSessionId: "pull_wrong_session",
      });

      const exitCode = await command.proc.exited;
      const stdout = await command.stdout;
      const stderr = await command.stderr;

      expect(exitCode).toBe(1);
      expect(stdout).toBe("");

      const payload = JSON.parse(stderr) as { status: string; code: string; error: string };
      expect(payload.status).toBe("error");
      expect(payload.code).toBe("CLI_PULL_SESSION_MISMATCH");
      expect(payload.error).toContain("Loopback callback pull session mismatch");
    } finally {
      platform.close();
    }
  });

  test("fails when the downloaded artifact hash does not match the granted bundle hash", async () => {
    const outputDir = createTempDir("tonquant-factor-pull-hash-output-");
    const platform = createFakePlatformServer({
      grantBytes: DEFAULT_ARTIFACT_BYTES,
      downloadBytes: Buffer.from("tampered-artifact", "utf-8"),
    });

    try {
      const command = spawnCli([
        "--json",
        "factor",
        "pull",
        "paid_delta",
        "--output-dir",
        outputDir,
        "--platform-url",
        platform.origin,
        "--timeout-ms",
        "5000",
      ]);

      const session = await platform.waitForPullSession();
      await platform.postCallback({ actualSessionId: session.pullSessionId });

      const exitCode = await command.proc.exited;
      const stdout = await command.stdout;
      const stderr = await command.stderr;

      expect(exitCode).toBe(1);
      expect(stdout).toBe("");

      const payload = JSON.parse(stderr) as { status: string; code: string; error: string };
      expect(payload.status).toBe("error");
      expect(payload.code).toBe("PLATFORM_ARTIFACT_HASH_MISMATCH");
      expect(payload.error).toContain("Downloaded artifact hash does not match");
    } finally {
      platform.close();
    }
  });
});

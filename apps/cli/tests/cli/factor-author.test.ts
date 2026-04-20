import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AuthorProfileSchema, normalizeTonAddress } from "@tonquant/core";

const repoRoot = resolve(import.meta.dir, "../../../..");
const cliEntry = resolve(repoRoot, "apps/cli/src/index.ts");
const decoder = new TextDecoder();
const tempDirs: string[] = [];
const publisherWallet = normalizeTonAddress(`0:${"2".repeat(64)}`);

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function readStream(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) {
    return "";
  }

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
}

async function runCli(
  args: string[],
  envOverrides: Record<string, string | undefined> = {},
  homeDir = createTempDir("tonquant-factor-author-home-"),
) {
  const proc = Bun.spawn({
    cmd: [process.execPath, cliEntry, ...args],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      HOME: homeDir,
      ...envOverrides,
    },
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    readStream(proc.stdout),
    readStream(proc.stderr),
  ]);

  return { exitCode, stdout, stderr };
}

function createFakeAuthorPlatformServer() {
  let origin = "";
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const url = new URL(request.url);

      if (
        request.method === "GET" &&
        url.pathname === `/v1/authors/${encodeURIComponent(publisherWallet)}`
      ) {
        return new Response(
          JSON.stringify({
            status: "ok",
            data: {
              wallet: publisherWallet,
              displayName: "multi-market desk",
              lifetimeSubmissions: 12,
              activeFactors: 4,
              aggregateRankIcOosIcir: 1.42,
              subscriberCount: 87,
              resolvedChallenges: 3,
              openChallenges: 1,
              latestPublicationAt: "2026-04-20T01:30:00.000Z",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          },
        );
      }

      if (
        request.method === "GET" &&
        url.pathname === `/v1/authors/${encodeURIComponent("0:missing")}`
      ) {
        return new Response(
          JSON.stringify({
            status: "error",
            error: "Author profile not found.",
            code: "PLATFORM_AUTHOR_NOT_FOUND",
          }),
          {
            status: 404,
            headers: { "content-type": "application/json; charset=utf-8" },
          },
        );
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
  origin = `http://${server.hostname}:${server.port}`;

  return {
    origin,
    stop: () => server.stop(true),
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("factor author show", () => {
  test("returns the live author profile in the standard JSON envelope", async () => {
    const platform = createFakeAuthorPlatformServer();
    try {
      const result = await runCli([
        "--json",
        "factor",
        "author",
        "show",
        publisherWallet,
        "--platform-url",
        platform.origin,
      ]);

      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        status: string;
        data: unknown;
      };
      expect(payload.status).toBe("ok");
      const profile = AuthorProfileSchema.parse(payload.data);
      expect(profile.wallet).toBe(publisherWallet);
      expect(profile.displayName).toBe("multi-market desk");
      expect(profile.aggregateRankIcOosIcir).toBe(1.42);
    } finally {
      platform.stop();
    }
  });

  test("renders the compact author summary for human output and honors --platform-url override", async () => {
    const platform = createFakeAuthorPlatformServer();
    try {
      const result = await runCli(
        ["factor", "author", "show", publisherWallet, "--platform-url", platform.origin],
        { TONQUANT_PLATFORM_URL: "http://127.0.0.1:9" },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Publisher Profile");
      expect(result.stdout).toContain("multi-market desk");
      expect(result.stdout).toContain(publisherWallet);
      expect(result.stdout).toContain("1.42");
      expect(result.stdout).toContain("2026-04-20T01:30:00.000Z");
    } finally {
      platform.stop();
    }
  });

  test("renders n/a for nullable author fields in human output", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: async () =>
        new Response(
          JSON.stringify({
            status: "ok",
            data: {
              wallet: publisherWallet,
              displayName: "null-safe desk",
              lifetimeSubmissions: 1,
              activeFactors: 0,
              aggregateRankIcOosIcir: null,
              subscriberCount: 0,
              resolvedChallenges: 0,
              openChallenges: 0,
              latestPublicationAt: undefined,
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          },
        ),
    });

    try {
      const result = await runCli([
        "factor",
        "author",
        "show",
        publisherWallet,
        "--platform-url",
        `http://${server.hostname}:${server.port}`,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("null-safe desk");
      expect(result.stdout).toContain("n/a");
    } finally {
      server.stop(true);
    }
  });

  test("returns structured platform errors on author lookup failure", async () => {
    const platform = createFakeAuthorPlatformServer();
    try {
      const result = await runCli([
        "--json",
        "factor",
        "author",
        "show",
        "0:missing",
        "--platform-url",
        platform.origin,
      ]);

      expect(result.exitCode).toBe(1);
      const payload = JSON.parse(result.stderr) as {
        status: string;
        error: string;
        code: string;
      };
      expect(payload.status).toBe("error");
      expect(payload.code).toBe("PLATFORM_AUTHOR_NOT_FOUND");
      expect(payload.error).toBe("Author profile not found.");
    } finally {
      platform.stop();
    }
  });
});

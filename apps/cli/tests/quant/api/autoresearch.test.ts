import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServiceError } from "@tonquant/core";
import { getAutoresearchTrack, initAutoresearchTrack } from "../../../src/quant/api/autoresearch";

const tempDirs: string[] = [];
const EVENT_LOG_PATH = join(tmpdir(), "tonquant-autoresearch-api-events.jsonl");
const EVENT_LOG_LOCK_PATH = `${EVENT_LOG_PATH}.lock`;

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  if (existsSync(EVENT_LOG_PATH)) rmSync(EVENT_LOG_PATH);
  if (existsSync(EVENT_LOG_LOCK_PATH)) rmSync(EVENT_LOG_LOCK_PATH);
  delete process.env.TONQUANT_EVENT_LOG_PATH;
});

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe("autoresearch api", () => {
  test("init writes invocation artifacts under autoresearch-runs", async () => {
    process.env.TONQUANT_EVENT_LOG_PATH = EVENT_LOG_PATH;
    const outputDir = createTempDir("tonquant-autoresearch-api-");

    const result = await initAutoresearchTrack({
      title: "API Momentum",
      strategy: "momentum",
      symbols: ["AAPL"],
      assetClass: "equity",
      marketRegion: "us",
      provider: "yfinance",
      startDate: "2024-01-01",
      endDate: "2024-03-31",
      outputDir,
    });

    const runArtifacts = result.artifacts.filter((artifact) =>
      artifact.path.includes("/autoresearch-runs/"),
    );

    expect(runArtifacts.some((artifact) => artifact.path.endsWith("/request.json"))).toBe(true);
    expect(runArtifacts.some((artifact) => artifact.path.endsWith("/result.json"))).toBe(true);
    expect(runArtifacts.some((artifact) => artifact.path.endsWith("/run.log"))).toBe(true);

    const requestPath = runArtifacts.find((artifact) =>
      artifact.path.endsWith("/request.json"),
    )?.path;
    expect(requestPath).toBeDefined();
    if (!requestPath) {
      throw new Error("Expected autoresearch API request artifact.");
    }
    expect(existsSync(requestPath)).toBe(true);
    const requestJson = JSON.parse(readFileSync(requestPath, "utf-8")) as Record<string, unknown>;
    expect(requestJson.provider).toBe("yfinance");
    expect(requestJson.outputDir).toBe(outputDir);
  });

  test("status calls also use autoresearch run artifacts", async () => {
    process.env.TONQUANT_EVENT_LOG_PATH = EVENT_LOG_PATH;
    const outputDir = createTempDir("tonquant-autoresearch-status-");
    const track = await initAutoresearchTrack({
      title: "Status Track",
      strategy: "momentum",
      symbols: ["TON/USDT"],
      startDate: "2024-01-01",
      endDate: "2024-03-31",
      outputDir,
    });

    const result = await getAutoresearchTrack({
      trackId: track.baseline.trackId,
      outputDir,
    });

    expect(result.artifacts.some((artifact) => artifact.path.includes("/autoresearch-runs/"))).toBe(
      true,
    );
  });

  test("init rejects unsupported provider combinations through the shared market contract", async () => {
    process.env.TONQUANT_EVENT_LOG_PATH = EVENT_LOG_PATH;
    const outputDir = createTempDir("tonquant-autoresearch-provider-");

    await expect(
      initAutoresearchTrack({
        title: "Bad Yahoo Crypto",
        strategy: "momentum",
        symbols: ["TON/USDT"],
        assetClass: "crypto",
        marketRegion: "ton",
        provider: "yfinance",
        startDate: "2024-01-01",
        endDate: "2024-03-31",
        outputDir,
      }),
    ).rejects.toMatchObject({
      code: "QUANT_PROVIDER_UNSUPPORTED",
      message: "Unsupported provider 'yfinance' for market 'crypto/ton'.",
    } satisfies Partial<ServiceError>);
  });
});

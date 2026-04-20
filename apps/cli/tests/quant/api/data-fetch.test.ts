import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServiceError } from "@tonquant/core";
import { runDataFetch, runDataInfo } from "../../../src/quant/api/data-fetch";

const tempDirs: string[] = [];
const OPENBB_ENV_KEYS = [
  "TONQUANT_OPENBB_API_URL",
  "TONQUANT_OPENBB_API_USERNAME",
  "TONQUANT_OPENBB_API_PASSWORD",
  "TONQUANT_OPENBB_CREDENTIALS_JSON",
  "TONQUANT_OPENBB_SOURCE_PROVIDER",
] as const;
const originalOpenBBEnv = Object.fromEntries(
  OPENBB_ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof OPENBB_ENV_KEYS)[number], string | undefined>;

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  for (const key of OPENBB_ENV_KEYS) {
    const original = originalOpenBBEnv[key];
    if (original == null) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
});

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe("data-fetch api", () => {
  test("maps missing OpenBB configuration into a stable service error for data fetch", async () => {
    delete process.env.TONQUANT_OPENBB_API_URL;

    await expect(
      runDataFetch({
        symbols: ["0700"],
        assetClass: "equity",
        marketRegion: "hk",
        provider: "openbb",
        outputDir: createTempDir("tonquant-data-api-openbb-fetch-"),
      }),
    ).rejects.toMatchObject({
      code: "QUANT_OPENBB_CONFIG_MISSING",
      message: "OpenBB API URL is not configured. Set TONQUANT_OPENBB_API_URL.",
    } satisfies Partial<ServiceError>);
  });

  test("maps missing OpenBB configuration into a stable service error for data info", async () => {
    delete process.env.TONQUANT_OPENBB_API_URL;

    await expect(
      runDataInfo({
        symbol: "600519",
        assetClass: "equity",
        marketRegion: "cn",
        provider: "openbb",
        outputDir: createTempDir("tonquant-data-api-openbb-info-"),
      }),
    ).rejects.toMatchObject({
      code: "QUANT_OPENBB_CONFIG_MISSING",
      message: "OpenBB API URL is not configured. Set TONQUANT_OPENBB_API_URL.",
    } satisfies Partial<ServiceError>);
  });

  test("rejects credentialed OpenBB HTTP endpoints outside localhost", async () => {
    process.env.TONQUANT_OPENBB_API_URL = "http://openbb.example.com/api/v1";
    process.env.TONQUANT_OPENBB_API_USERNAME = "alice";
    process.env.TONQUANT_OPENBB_API_PASSWORD = "secret";

    await expect(
      runDataFetch({
        symbols: ["0700"],
        assetClass: "equity",
        marketRegion: "hk",
        provider: "openbb",
        outputDir: createTempDir("tonquant-data-api-openbb-http-"),
      }),
    ).rejects.toMatchObject({
      code: "QUANT_OPENBB_CONFIG_INVALID",
      message:
        "Refusing to send OpenBB credentials over non-HTTPS transport to http://openbb.example.com.",
    } satisfies Partial<ServiceError>);
  });
});

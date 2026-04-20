import { afterEach, describe, expect, mock, test } from "bun:test";
// @ts-expect-error - backend fixtures are runtime-tested outside the CLI tsconfig boundary
import type { QuantBackendError } from "../../../../quant-backend/src/errors";
// @ts-expect-error - backend fixtures are runtime-tested outside the CLI tsconfig boundary
import { resolveInstrument } from "../../../../quant-backend/src/market/instruments";
// @ts-expect-error - backend fixtures are runtime-tested outside the CLI tsconfig boundary
import {
  fetchOpenBBDatasetDocument,
  openbbSymbolForInstrument,
} from "../../../../quant-backend/src/market/openbb";

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
const originalFetch = globalThis.fetch;

afterEach(() => {
  for (const key of OPENBB_ENV_KEYS) {
    const original = originalOpenBBEnv[key];
    if (original == null) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
  globalThis.fetch = originalFetch;
});

describe("openbb transport", () => {
  test("normalizes HK and CN symbols for OpenBB requests", () => {
    const hkInstrument = resolveInstrument({
      symbol: "700",
      assetClass: "equity",
      marketRegion: "hk",
      provider: "openbb",
    });
    const cnInstrument = resolveInstrument({
      symbol: "600519",
      assetClass: "equity",
      marketRegion: "cn",
      venue: "sse",
      provider: "openbb",
    });

    expect(openbbSymbolForInstrument(hkInstrument)).toBe("0700.HK");
    expect(openbbSymbolForInstrument(cnInstrument)).toBe("600519.SS");
  });

  test("fetchOpenBBDatasetDocument calls the configured OpenBB API and normalizes bars", async () => {
    process.env.TONQUANT_OPENBB_API_URL = "http://127.0.0.1:8080";
    process.env.TONQUANT_OPENBB_API_USERNAME = "alice";
    process.env.TONQUANT_OPENBB_API_PASSWORD = "secret";
    process.env.TONQUANT_OPENBB_CREDENTIALS_JSON = JSON.stringify({ fmp_api_key: "demo" });
    process.env.TONQUANT_OPENBB_SOURCE_PROVIDER = "fmp";

    const instrument = resolveInstrument({
      symbol: "0700",
      assetClass: "equity",
      marketRegion: "hk",
      provider: "openbb",
    });

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.toString()).toContain("/api/v1/equity/price/historical");
      expect(url.searchParams.get("symbol")).toBe("0700.HK");
      expect(url.searchParams.get("interval")).toBe("1d");
      expect(url.searchParams.get("start_date")).toBe("2024-01-01");
      expect(url.searchParams.get("end_date")).toBe("2024-03-31");
      expect(url.searchParams.get("provider")).toBe("fmp");
      expect(init?.headers).toMatchObject({
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from("alice:secret", "utf-8").toString("base64")}`,
        "X-OpenBB-Credentials": JSON.stringify({ fmp_api_key: "demo" }),
      });
      return new Response(
        JSON.stringify({
          results: [
            {
              date: "2024-01-02",
              open: 320,
              high: 325,
              low: 318,
              close: 323,
              volume: 900_000,
            },
            {
              date: "2024-01-03",
              open: 323,
              high: 330,
              low: 322,
              close: 328,
              volume: 950_000,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof globalThis.fetch;

    const dataset = await fetchOpenBBDatasetDocument({
      instrument,
      interval: "1d",
      startDate: "2024-01-01",
      endDate: "2024-03-31",
    });

    expect(dataset.provider).toBe("openbb");
    expect(dataset.instrument.provider).toBe("openbb");
    expect(dataset.bars).toHaveLength(2);
    expect(dataset.bars[0]?.date).toBe("2024-01-02");
  });

  test("fetchOpenBBDatasetDocument rejects unsupported intervals explicitly", async () => {
    process.env.TONQUANT_OPENBB_API_URL = "http://127.0.0.1:8080/api/v1";
    const instrument = resolveInstrument({
      symbol: "0700",
      assetClass: "equity",
      marketRegion: "hk",
      provider: "openbb",
    });

    await expect(
      fetchOpenBBDatasetDocument({
        instrument,
        interval: "1h",
      }),
    ).rejects.toMatchObject({
      code: "QUANT_OPENBB_INTERVAL_UNSUPPORTED",
      message: "Unsupported interval '1h' for provider 'openbb'.",
    } satisfies Partial<QuantBackendError>);
  });
});

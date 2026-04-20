import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  buildPriceIndex,
  cachedFindAssetBySymbol,
  cachedGetAssets,
  clearCache,
} from "../../src/services/cache.js";
import type { Asset } from "../../src/types/api.js";

const mockAsset: Asset = {
  contract_address: "EQ_test_addr",
  symbol: "TEST",
  display_name: "Test Token",
  decimals: 9,
  dex_usd_price: "1.50",
};

const mockAssetsResponse = { asset_list: [mockAsset] };

let fetchSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  clearCache();
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation((() =>
    Promise.resolve(
      new Response(JSON.stringify(mockAssetsResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )) as unknown as typeof fetch);
});

afterEach(() => {
  fetchSpy.mockRestore();
  clearCache();
});

describe("cachedGetAssets", () => {
  test("fetches assets on first call", async () => {
    const assets = await cachedGetAssets();
    expect(assets).toHaveLength(1);
    expect(assets[0]?.symbol).toBe("TEST");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("returns cached data on second call", async () => {
    await cachedGetAssets();
    await cachedGetAssets();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("refetches after clearCache", async () => {
    await cachedGetAssets();
    clearCache();
    await cachedGetAssets();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("cachedFindAssetBySymbol", () => {
  test("finds asset case-insensitively", async () => {
    const asset = await cachedFindAssetBySymbol("test");
    expect(asset?.symbol).toBe("TEST");
  });

  test("returns undefined for unknown symbol", async () => {
    const asset = await cachedFindAssetBySymbol("UNKNOWN");
    expect(asset).toBeUndefined();
  });
});

describe("buildPriceIndex", () => {
  test("maps address to USD price", () => {
    const index = buildPriceIndex([mockAsset]);
    expect(index.get("EQ_test_addr")).toBe("1.50");
  });

  test("skips assets without price", () => {
    const noPrice: Asset = {
      contract_address: "EQ_no_price",
      symbol: "NP",
      decimals: 9,
    };
    const index = buildPriceIndex([noPrice]);
    expect(index.has("EQ_no_price")).toBe(false);
  });

  test("prefers dex_usd_price over dex_price_usd", () => {
    const both: Asset = {
      contract_address: "EQ_both",
      symbol: "BOTH",
      decimals: 9,
      dex_usd_price: "2.00",
      dex_price_usd: "1.00",
    };
    const index = buildPriceIndex([both]);
    expect(index.get("EQ_both")).toBe("2.00");
  });
});

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { findAssetBySymbol, getAssets, getPools, simulateSwap } from "../../src/services/stonfi.js";
import type { Asset, Pool } from "../../src/types/api.js";

const mockAssets: Asset[] = [
  { contract_address: "EQ_a", symbol: "AAA", decimals: 9, dex_usd_price: "1.00" },
  { contract_address: "EQ_b", symbol: "BBB", decimals: 9, dex_usd_price: "2.00" },
];

const mockPools: Pool[] = [
  {
    address: "EQ_pool",
    token0_address: "EQ_a",
    token1_address: "EQ_b",
    reserve0: "100",
    reserve1: "200",
  },
];

let fetchSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  fetchSpy = spyOn(globalThis, "fetch");
});

afterEach(() => {
  fetchSpy.mockRestore();
});

function mockResponse(data: unknown, status = 200) {
  return (() =>
    Promise.resolve(
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    )) as unknown as typeof fetch;
}

describe("getAssets", () => {
  test("returns validated asset array", async () => {
    fetchSpy.mockImplementation(mockResponse({ asset_list: mockAssets }));
    const assets = await getAssets();
    expect(assets).toHaveLength(2);
    expect(assets[0]?.symbol).toBe("AAA");
  });

  test("throws on HTTP error", async () => {
    fetchSpy.mockImplementation(mockResponse({}, 500));
    await expect(getAssets()).rejects.toThrow("STON.fi API error");
  });
});

describe("findAssetBySymbol", () => {
  test("finds asset case-insensitively", async () => {
    fetchSpy.mockImplementation(mockResponse({ asset_list: mockAssets }));
    const asset = await findAssetBySymbol("aaa");
    expect(asset?.symbol).toBe("AAA");
  });

  test("returns undefined for unknown symbol", async () => {
    fetchSpy.mockImplementation(mockResponse({ asset_list: mockAssets }));
    const asset = await findAssetBySymbol("UNKNOWN");
    expect(asset).toBeUndefined();
  });
});

describe("getPools", () => {
  test("returns validated pool array", async () => {
    fetchSpy.mockImplementation(mockResponse({ pool_list: mockPools }));
    const pools = await getPools();
    expect(pools).toHaveLength(1);
    expect(pools[0]?.address).toBe("EQ_pool");
  });
});

describe("simulateSwap", () => {
  test("returns validated simulation response", async () => {
    const mockResult = {
      offer_address: "EQ_a",
      ask_address: "EQ_b",
      offer_units: "1000",
      ask_units: "500",
      swap_rate: "0.5",
      price_impact: "0.1%",
      min_ask_units: "495",
    };
    fetchSpy.mockImplementation(mockResponse(mockResult));

    const result = await simulateSwap({
      offer_address: "EQ_a",
      ask_address: "EQ_b",
      units: "1000",
      slippage_tolerance: "0.01",
    });

    expect(result.ask_units).toBe("500");
    expect(result.price_impact).toBe("0.1%");
    expect(result.min_ask_units).toBe("495");
  });

  test("throws on HTTP error", async () => {
    fetchSpy.mockImplementation(mockResponse({}, 400));
    await expect(
      simulateSwap({
        offer_address: "EQ_a",
        ask_address: "EQ_b",
        units: "1000",
        slippage_tolerance: "0.01",
      }),
    ).rejects.toThrow("STON.fi swap simulate error");
  });
});

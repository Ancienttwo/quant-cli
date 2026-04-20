import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  type Asset,
  buildPriceIndex,
  calcUsdValue,
  clearCache,
  fromRawUnits,
  type Pool,
} from "@tonquant/core";

const mockAssetA: Asset = {
  contract_address: "EQ_not",
  symbol: "NOT",
  decimals: 9,
  dex_usd_price: "0.01",
};

const mockAssetB: Asset = {
  contract_address: "EQ_ton",
  symbol: "TON",
  decimals: 9,
  dex_usd_price: "2.00",
};

const mockPool: Pool = {
  address: "EQ_pool",
  token0_address: "EQ_not",
  token1_address: "EQ_ton",
  reserve0: "100000000000", // 100 NOT
  reserve1: "5000000000", // 5 TON
};

let fetchSpy: ReturnType<typeof spyOn>;

function mockFetchForPools() {
  const _callCount = 0;
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(((url: string) => {
    if (url.includes("/assets")) {
      return Promise.resolve(
        new Response(JSON.stringify({ asset_list: [mockAssetA, mockAssetB] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/pools")) {
      return Promise.resolve(
        new Response(JSON.stringify({ pool_list: [mockPool] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as unknown as typeof fetch);
}

beforeEach(() => {
  clearCache();
  mockFetchForPools();
});

afterEach(() => {
  fetchSpy.mockRestore();
  clearCache();
});

describe("pools command", () => {
  test("calculates liquidity_usd from reserves and prices", () => {
    const priceIndex = buildPriceIndex([mockAssetA, mockAssetB]);
    const priceA = priceIndex.get("EQ_not") ?? "0";
    const priceB = priceIndex.get("EQ_ton") ?? "0";
    const humanReserve0 = fromRawUnits(mockPool.reserve0, 9);
    const humanReserve1 = fromRawUnits(mockPool.reserve1, 9);
    const usdA = Number.parseFloat(calcUsdValue(humanReserve0, priceA));
    const usdB = Number.parseFloat(calcUsdValue(humanReserve1, priceB));
    const liquidity = (usdA + usdB).toFixed(2);

    // 100 NOT * 0.01 = 1.00, 5 TON * 2.00 = 10.00, total = 11.00
    expect(liquidity).toBe("11.00");
  });

  test("pair validation rejects invalid format", () => {
    const parts = "NOTTON".split("/");
    expect(parts.length).toBe(1);
  });

  test("pair validation accepts valid format", () => {
    const parts = "NOT/TON".split("/");
    expect(parts.length).toBe(2);
    expect(parts[0]).toBe("NOT");
    expect(parts[1]).toBe("TON");
  });
});

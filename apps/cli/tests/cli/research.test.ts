import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { type Asset, clearCache, fetchResearchData, type Pool } from "@tonquant/core";

const assets: Asset[] = [
  {
    contract_address: "EQ_not",
    symbol: "NOT",
    display_name: "Notcoin",
    decimals: 9,
    dex_usd_price: "0.01",
  },
  {
    contract_address: "EQ_ton",
    symbol: "TON",
    display_name: "Toncoin",
    decimals: 9,
    dex_usd_price: "3.70",
  },
  {
    contract_address: "EQ_usdt",
    symbol: "USDT",
    display_name: "Tether",
    decimals: 6,
    dex_usd_price: "1.00",
  },
];

const pools: Pool[] = [
  {
    address: "EQ_pool_1",
    token0_address: "EQ_not",
    token1_address: "EQ_ton",
    reserve0: "100000000000000",
    reserve1: "500000000000",
    lp_fee: "0.3%",
    apy_1d: "12.5%",
  },
  {
    address: "EQ_pool_2",
    token0_address: "EQ_not",
    token1_address: "EQ_usdt",
    reserve0: "50000000000000",
    reserve1: "500000000",
    lp_fee: "0.3%",
  },
];

let fetchSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  clearCache();
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(((url: string) => {
    if (url.includes("/pools")) {
      return Promise.resolve(
        new Response(JSON.stringify({ pool_list: pools }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify({ asset_list: assets }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as unknown as typeof fetch);
});

afterEach(() => {
  fetchSpy.mockRestore();
  clearCache();
});

describe("research liquidity command", () => {
  test("returns composite data for a token", async () => {
    const data = await fetchResearchData("NOT");

    expect(data.token.symbol).toBe("NOT");
    expect(data.token.price_usd).toBe("0.01");
    expect(data.pools).toHaveLength(2);
    expect(data.summary.pool_count).toBe(2);
    expect(data.summary.top_pair).toContain("NOT");
  });

  test("calculates total liquidity across pools", async () => {
    const data = await fetchResearchData("NOT");
    const totalLiq = Number.parseFloat(data.summary.total_liquidity_usd);
    expect(totalLiq).toBeGreaterThan(0);
  });

  test("throws for unknown token", async () => {
    await expect(fetchResearchData("XYZ")).rejects.toThrow("not found");
  });
});

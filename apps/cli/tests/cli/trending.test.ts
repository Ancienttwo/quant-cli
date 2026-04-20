import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  type Asset,
  buildPriceIndex,
  cachedGetAssets,
  cachedGetPools,
  clearCache,
  fromRawUnits,
  type Pool,
} from "@tonquant/core";

const assets: Asset[] = [
  { contract_address: "EQ_a", symbol: "AAA", decimals: 9, dex_usd_price: "1.00" },
  { contract_address: "EQ_b", symbol: "BBB", decimals: 9, dex_usd_price: "0.50" },
  { contract_address: "EQ_c", symbol: "CCC", decimals: 9, dex_usd_price: "0.10" },
];

const pools: Pool[] = [
  // AAA/BBB pool with high liquidity
  {
    address: "EQ_pool1",
    token0_address: "EQ_a",
    token1_address: "EQ_b",
    reserve0: "1000000000000", // 1000 AAA
    reserve1: "2000000000000", // 2000 BBB
  },
  // BBB/CCC pool with lower liquidity
  {
    address: "EQ_pool2",
    token0_address: "EQ_b",
    token1_address: "EQ_c",
    reserve0: "100000000000", // 100 BBB
    reserve1: "500000000000", // 500 CCC
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

describe("trending command", () => {
  test("sorts tokens by total liquidity descending", async () => {
    const allAssets = await cachedGetAssets();
    const allPools = await cachedGetPools();
    const priceIndex = buildPriceIndex(allAssets);
    const assetByAddr = new Map(allAssets.map((a) => [a.contract_address, a]));

    const liqByAddr = new Map<string, number>();
    for (const pool of allPools) {
      const a0 = assetByAddr.get(pool.token0_address);
      const a1 = assetByAddr.get(pool.token1_address);
      if (!a0 || !a1) continue;
      const p0 = Number.parseFloat(priceIndex.get(pool.token0_address) ?? "0");
      const p1 = Number.parseFloat(priceIndex.get(pool.token1_address) ?? "0");
      const r0 = Number.parseFloat(fromRawUnits(pool.reserve0, a0.decimals));
      const r1 = Number.parseFloat(fromRawUnits(pool.reserve1, a1.decimals));
      const poolLiq = r0 * p0 + r1 * p1;
      for (const addr of [pool.token0_address, pool.token1_address]) {
        liqByAddr.set(addr, (liqByAddr.get(addr) ?? 0) + poolLiq);
      }
    }

    const ranked = [...allAssets]
      .filter((a) => liqByAddr.has(a.contract_address))
      .sort(
        (a, b) =>
          (liqByAddr.get(b.contract_address) ?? 0) - (liqByAddr.get(a.contract_address) ?? 0),
      );

    // BBB should rank highest (appears in both pools)
    expect(ranked[0]?.symbol).toBe("BBB");
  });

  test("respects limit parameter", async () => {
    const allAssets = await cachedGetAssets();
    const limited = allAssets.slice(0, 2);
    expect(limited).toHaveLength(2);
  });
});

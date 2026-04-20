import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveConfig } from "../../src/config/index.js";
import { clearCache } from "../../src/services/cache.js";
import {
  fetchBalanceData,
  fetchHistoryData,
  fetchPoolData,
  fetchPriceData,
  fetchResearchData,
  fetchSwapSimulation,
  fetchTrendingData,
} from "../../src/services/queries.js";
import type { Asset, Pool } from "../../src/types/api.js";

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
    contract_address: "EQ_btc_1",
    symbol: "BTC",
    display_name: "Fake BTC One",
    decimals: 9,
    dex_usd_price: "1.00",
  },
  {
    contract_address: "EQ_btc_2",
    symbol: "BTC",
    display_name: "Fake BTC Two",
    decimals: 9,
    dex_usd_price: "2.00",
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
];

let fetchSpy: ReturnType<typeof spyOn>;
const tempDirs: string[] = [];

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
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("fetchPriceData", () => {
  test("returns enriched price data for known symbol", async () => {
    const data = await fetchPriceData("NOT");
    expect(data.symbol).toBe("NOT");
    expect(data.name).toBe("Notcoin");
    expect(data.price_usd).toBe("0.01");
    expect(data.address).toBe("EQ_not");
    expect(data.decimals).toBe(9);
  });

  test("throws TOKEN_NOT_FOUND for unknown symbol", async () => {
    await expect(fetchPriceData("XYZ")).rejects.toThrow("not found");
  });

  test("is case-insensitive", async () => {
    const data = await fetchPriceData("not");
    expect(data.symbol).toBe("NOT");
  });

  test("rejects ambiguous TON symbols instead of picking the first match", async () => {
    await expect(fetchPriceData("BTC")).rejects.toMatchObject({
      code: "TON_SYMBOL_AMBIGUOUS",
    });
  });
});

describe("fetchPoolData", () => {
  test("returns enriched pool data with liquidity", async () => {
    const data = await fetchPoolData("NOT", "TON");
    expect(data.pool_address).toBe("EQ_pool_1");
    expect(data.fee_rate).toBe("0.3%");
    expect(data.apy).toBe("12.5%");
    // liquidity = 100000 NOT * 0.01 + 500 TON * 3.70 = 1000 + 1850 = 2850
    expect(data.liquidity_usd).toBe("2850.00");
  });

  test("throws TOKEN_NOT_FOUND for unknown token", async () => {
    await expect(fetchPoolData("XYZ", "TON")).rejects.toThrow("not found");
  });

  test("throws POOL_NOT_FOUND for nonexistent pair", async () => {
    // TON/TON doesn't exist
    await expect(fetchPoolData("TON", "TON")).rejects.toThrow("No pool found");
  });
});

describe("fetchTrendingData", () => {
  test("returns tokens ranked by liquidity", async () => {
    const data = await fetchTrendingData(10);
    expect(data.tokens.length).toBeGreaterThan(0);
    expect(data.tokens[0]?.rank).toBe(1);
    expect(data.tokens[0]?.symbol).toBeDefined();
  });

  test("respects limit parameter", async () => {
    const data = await fetchTrendingData(1);
    expect(data.tokens).toHaveLength(1);
  });
});

describe("fetchSwapSimulation", () => {
  test("returns simulation with unit conversion and USD", async () => {
    // Override fetch to handle both assets and swap simulate
    fetchSpy.mockRestore();
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(((url: string) => {
      if (url.includes("/swap/simulate")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              offer_address: "EQ_not",
              ask_address: "EQ_ton",
              offer_units: "1000000000000",
              ask_units: "270270270",
              swap_rate: "0.00027027",
              price_impact: "0.15%",
              min_ask_units: "267567567",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
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

    const data = await fetchSwapSimulation("NOT", "TON", "1000", "1");
    expect(data.type).toBe("simulation");
    expect(data.from.symbol).toBe("NOT");
    expect(data.to.symbol).toBe("TON");
    expect(data.price_impact).toBe("0.15%");
    expect(data.slippage_tolerance).toBe("1%");
    expect(Number.parseFloat(data.from.amount_usd)).toBeGreaterThan(0);
  });

  test("throws for unknown token", async () => {
    await expect(fetchSwapSimulation("XYZ", "TON", "100", "1")).rejects.toThrow("not found");
  });
});

describe("fetchResearchData", () => {
  test("returns composite research data", async () => {
    const data = await fetchResearchData("NOT");
    expect(data.token.symbol).toBe("NOT");
    expect(data.pools.length).toBeGreaterThan(0);
    expect(data.summary.pool_count).toBeGreaterThan(0);
    expect(Number.parseFloat(data.summary.total_liquidity_usd)).toBeGreaterThan(0);
  });
});

describe("config path plumbing", () => {
  test("fetchBalanceData uses the wallet from the explicit config path", async () => {
    const root = mkdtempSync(join(tmpdir(), "tonquant-balance-config-"));
    tempDirs.push(root);
    const configPath = join(root, "wallet.json");

    await saveConfig(
      {
        network: "testnet",
        wallet: {
          mnemonic_encrypted: "ciphertext",
          address: "UQ_cfg_balance",
          version: "v5r1",
        },
        preferences: {
          default_slippage: 0.01,
          default_dex: "stonfi",
          currency: "usd",
        },
      },
      { configPath },
    );

    fetchSpy.mockRestore();
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(((url: string) => {
      if (url.includes("/accounts/UQ_cfg_balance/jettons")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              balances: [
                {
                  balance: "2500000000",
                  jetton: {
                    address: "EQ_not",
                    name: "Notcoin",
                    symbol: "NOT",
                    decimals: 9,
                  },
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url.includes("/accounts/UQ_cfg_balance")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              address: "UQ_cfg_balance",
              balance: "12500000000",
              status: "active",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
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

    const data = await fetchBalanceData(true, { configPath });
    expect(data.address).toBe("UQ_cfg_balance");
    expect(data.network).toBe("testnet");
    expect(data.jettons[0]?.symbol).toBe("NOT");
    expect(fetchSpy).toHaveBeenCalledWith("https://tonapi.io/v2/accounts/UQ_cfg_balance");
  });

  test("fetchHistoryData uses the wallet from the explicit config path", async () => {
    const root = mkdtempSync(join(tmpdir(), "tonquant-history-config-"));
    tempDirs.push(root);
    const configPath = join(root, "wallet.json");

    await saveConfig(
      {
        network: "mainnet",
        wallet: {
          mnemonic_encrypted: "ciphertext",
          address: "UQ_cfg_history",
          version: "v5r1",
        },
        preferences: {
          default_slippage: 0.01,
          default_dex: "stonfi",
          currency: "usd",
        },
      },
      { configPath },
    );

    fetchSpy.mockRestore();
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(((_url: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            events: [
              {
                event_id: "evt_cfg_1",
                timestamp: 1711100000,
                actions: [{ type: "TonTransfer", status: "ok" }],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )) as unknown as typeof fetch);

    const data = await fetchHistoryData(5, { configPath });
    expect(data.address).toBe("UQ_cfg_history");
    expect(data.transactions[0]?.event_id).toBe("evt_cfg_1");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://tonapi.io/v2/accounts/UQ_cfg_history/events?limit=5",
    );
  });
});

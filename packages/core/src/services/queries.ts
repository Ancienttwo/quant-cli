import { loadConfig } from "../config/index.js";
import { ServiceError } from "../errors.js";
import type { Asset } from "../types/api.js";
import type {
  BalanceData,
  HistoryData,
  PoolData,
  PriceData,
  ResearchData,
  SwapSimulationData,
  TrendingData,
} from "../types/data.js";
import { calcUsdValue, fromRawUnits, toRawUnits } from "../utils/units.js";
import {
  buildPriceIndex,
  cachedFindAssetsBySymbol,
  cachedGetAssets,
  cachedGetPools,
} from "./cache.js";
import { simulateSwap } from "./stonfi.js";
import { getBalance, getJettonBalances, getTransactions } from "./tonapi.js";
import { getWalletAddress } from "./wallet.js";

const TON_DECIMALS = 9;

interface QueryConfigOptions {
  configPath?: string;
}

/**
 * Fetch enriched price data for a token symbol.
 */
function aggregateVolume(
  pools: Awaited<ReturnType<typeof cachedGetPools>>,
  address: string,
): string {
  let total = 0;
  for (const pool of pools) {
    if (pool.token0_address === address || pool.token1_address === address) {
      total += Number.parseFloat(pool.volume_24h_usd ?? "0");
    }
  }
  return total > 0 ? total.toFixed(2) : "N/A";
}

async function resolveUniqueTonAssetBySymbol(symbol: string): Promise<Asset> {
  const matches = await cachedFindAssetsBySymbol(symbol);
  if (matches.length === 0) {
    throw new ServiceError(`Token "${symbol}" not found`, "TOKEN_NOT_FOUND");
  }
  if (matches.length > 1) {
    throw new ServiceError(
      `TON symbol "${symbol.toUpperCase()}" is ambiguous across ${matches.length} assets. Use 'tonquant research quote ${symbol.toUpperCase()}' for generic market data.`,
      "TON_SYMBOL_AMBIGUOUS",
    );
  }
  const match = matches[0];
  if (!match) {
    throw new ServiceError(`Token "${symbol}" not found`, "TOKEN_NOT_FOUND");
  }
  return match;
}

export async function fetchPriceData(symbol: string): Promise<PriceData> {
  const asset = await resolveUniqueTonAssetBySymbol(symbol);

  const pools = await cachedGetPools();
  const volume = aggregateVolume(pools, asset.contract_address);

  return {
    symbol: asset.symbol,
    name: asset.display_name ?? asset.symbol,
    address: asset.contract_address,
    decimals: asset.decimals,
    price_usd: asset.dex_usd_price ?? asset.dex_price_usd ?? "0",
    change_24h: "N/A",
    volume_24h: volume,
  };
}

/**
 * Fetch enriched pool data for a token pair.
 */
export async function fetchPoolData(symbolA: string, symbolB: string): Promise<PoolData> {
  const assets = await cachedGetAssets();
  const assetA = await resolveUniqueTonAssetBySymbol(symbolA);
  const assetB = await resolveUniqueTonAssetBySymbol(symbolB);

  const pools = await cachedGetPools();
  const pool = pools.find(
    (p) =>
      (p.token0_address === assetA.contract_address &&
        p.token1_address === assetB.contract_address) ||
      (p.token0_address === assetB.contract_address &&
        p.token1_address === assetA.contract_address),
  );
  if (!pool) {
    throw new ServiceError(`No pool found for ${symbolA}/${symbolB}`, "POOL_NOT_FOUND");
  }

  const priceIndex = buildPriceIndex(assets);
  const priceA = priceIndex.get(assetA.contract_address) ?? "0";
  const priceB = priceIndex.get(assetB.contract_address) ?? "0";
  const humanReserve0 = fromRawUnits(pool.reserve0, assetA.decimals);
  const humanReserve1 = fromRawUnits(pool.reserve1, assetB.decimals);
  const usdA = Number.parseFloat(calcUsdValue(humanReserve0, priceA));
  const usdB = Number.parseFloat(calcUsdValue(humanReserve1, priceB));

  return {
    pool_address: pool.address,
    token0: { symbol: assetA.symbol, reserve: humanReserve0 },
    token1: { symbol: assetB.symbol, reserve: humanReserve1 },
    liquidity_usd: (usdA + usdB).toFixed(2),
    volume_24h: "N/A",
    fee_rate: pool.lp_fee ?? "0.3%",
    apy: pool.apy_1d,
  };
}

/**
 * Fetch trending tokens ranked by total liquidity.
 */
export async function fetchTrendingData(limit: number): Promise<TrendingData> {
  const assets = await cachedGetAssets();
  const pools = await cachedGetPools();
  const priceIndex = buildPriceIndex(assets);
  const assetByAddress = new Map(assets.map((a) => [a.contract_address, a]));

  const liquidityByAddress = new Map<string, number>();
  for (const pool of pools) {
    if (pool.deprecated) continue;
    const a0 = assetByAddress.get(pool.token0_address);
    const a1 = assetByAddress.get(pool.token1_address);
    if (!a0 || !a1) continue;

    const p0 = Number.parseFloat(priceIndex.get(pool.token0_address) ?? "0");
    const p1 = Number.parseFloat(priceIndex.get(pool.token1_address) ?? "0");
    const r0 = Number.parseFloat(fromRawUnits(pool.reserve0, a0.decimals));
    const r1 = Number.parseFloat(fromRawUnits(pool.reserve1, a1.decimals));
    const poolLiq = r0 * p0 + r1 * p1;

    for (const addr of [pool.token0_address, pool.token1_address]) {
      liquidityByAddress.set(addr, (liquidityByAddress.get(addr) ?? 0) + poolLiq);
    }
  }

  const ranked = [...assets]
    .filter((a) => liquidityByAddress.has(a.contract_address))
    .sort(
      (a, b) =>
        (liquidityByAddress.get(b.contract_address) ?? 0) -
        (liquidityByAddress.get(a.contract_address) ?? 0),
    )
    .slice(0, limit);

  return {
    tokens: ranked.map((asset, index) => ({
      rank: index + 1,
      symbol: asset.symbol,
      price_usd: asset.dex_usd_price ?? asset.dex_price_usd ?? "0",
      change_24h: "N/A",
      volume_24h: aggregateVolume(pools, asset.contract_address),
    })),
  };
}

/**
 * Fetch enriched balance data for a wallet.
 */
export async function fetchBalanceData(
  includeAll: boolean,
  options: QueryConfigOptions = {},
): Promise<BalanceData> {
  const config = await loadConfig(options);
  const address = getWalletAddress(config);
  const tonBalance = await getBalance(address);

  const assets = await cachedGetAssets();
  const priceIndex = buildPriceIndex(assets);

  const humanTonBalance = fromRawUnits(tonBalance.balance, TON_DECIMALS);
  const tonAsset = assets.find((a) => a.symbol.toUpperCase() === "TON");
  const tonPrice = tonAsset ? (tonAsset.dex_usd_price ?? tonAsset.dex_price_usd ?? "0") : "0";
  const tonUsd = calcUsdValue(humanTonBalance, tonPrice);

  let totalUsd = Number.parseFloat(tonUsd);

  const jettons = includeAll ? await getJettonBalances(address) : [];
  const jettonEntries = jettons.map((j) => {
    const humanBalance = fromRawUnits(j.balance, j.jetton.decimals);
    const price = priceIndex.get(j.jetton.address) ?? "0";
    const usdValue = calcUsdValue(humanBalance, price);
    totalUsd += Number.parseFloat(usdValue);
    return {
      symbol: j.jetton.symbol,
      balance: humanBalance,
      usd_value: usdValue,
    };
  });

  return {
    address,
    network: config.network,
    toncoin: { balance: humanTonBalance, usd_value: tonUsd },
    jettons: jettonEntries,
    total_usd: totalUsd.toFixed(2),
  };
}

/**
 * Fetch swap simulation data.
 */
export async function fetchSwapSimulation(
  from: string,
  to: string,
  amount: string,
  slippagePct: string,
): Promise<SwapSimulationData> {
  const fromAsset = await resolveUniqueTonAssetBySymbol(from);
  const toAsset = await resolveUniqueTonAssetBySymbol(to);

  const slippage = (Number.parseFloat(slippagePct) / 100).toString();
  const rawUnits = toRawUnits(amount, fromAsset.decimals);

  const result = await simulateSwap({
    offer_address: fromAsset.contract_address,
    ask_address: toAsset.contract_address,
    units: rawUnits,
    slippage_tolerance: slippage,
  });

  const expectedAmount = fromRawUnits(result.ask_units, toAsset.decimals);
  const minReceived = fromRawUnits(result.min_ask_units, toAsset.decimals);

  const assets = await cachedGetAssets();
  const priceIndex = buildPriceIndex(assets);
  const fromPrice = priceIndex.get(fromAsset.contract_address) ?? "0";
  const toPrice = priceIndex.get(toAsset.contract_address) ?? "0";

  return {
    type: "simulation" as const,
    from: { symbol: fromAsset.symbol, amount, amount_usd: calcUsdValue(amount, fromPrice) },
    to: {
      symbol: toAsset.symbol,
      expected_amount: expectedAmount,
      amount_usd: calcUsdValue(expectedAmount, toPrice),
    },
    price_impact: result.price_impact,
    fee: result.fee_units ? fromRawUnits(result.fee_units, toAsset.decimals) : "0",
    minimum_received: minReceived,
    slippage_tolerance: `${slippagePct}%`,
    route: result.route ?? [`${fromAsset.symbol} → ${toAsset.symbol}`],
  };
}

/**
 * Fetch transaction history for the configured wallet.
 */
export async function fetchHistoryData(
  limit: number,
  options: QueryConfigOptions = {},
): Promise<HistoryData> {
  const config = await loadConfig(options);
  const address = getWalletAddress(config);
  const events = await getTransactions(address, limit);

  return {
    address,
    transactions: events.map((e) => ({
      event_id: e.event_id,
      timestamp: new Date(e.timestamp * 1000).toISOString(),
      type: e.actions[0]?.type ?? "unknown",
      description: e.actions[0]?.simple_preview?.description ?? "—",
      status: e.actions[0]?.status ?? "unknown",
    })),
    total: events.length,
  };
}

/**
 * Fetch TON liquidity research data for a token.
 */
export async function fetchResearchData(symbol: string): Promise<ResearchData> {
  const token = await fetchPriceData(symbol);
  const assets = await cachedGetAssets();
  const pools = await cachedGetPools();
  const priceIndex = buildPriceIndex(assets);
  const assetByAddress = new Map(assets.map((a) => [a.contract_address, a]));

  // Find all pools containing this token
  const relatedPools = pools.filter(
    (p) => p.token0_address === token.address || p.token1_address === token.address,
  );

  let totalLiquidity = 0;
  let topPair = "—";
  let topLiq = 0;

  const poolDataList = relatedPools.map((pool) => {
    const a0 = assetByAddress.get(pool.token0_address);
    const a1 = assetByAddress.get(pool.token1_address);
    const s0 = a0?.symbol ?? "???";
    const s1 = a1?.symbol ?? "???";
    const d0 = a0?.decimals ?? 9;
    const d1 = a1?.decimals ?? 9;
    const p0 = Number.parseFloat(priceIndex.get(pool.token0_address) ?? "0");
    const p1 = Number.parseFloat(priceIndex.get(pool.token1_address) ?? "0");
    const hr0 = fromRawUnits(pool.reserve0, d0);
    const hr1 = fromRawUnits(pool.reserve1, d1);
    const liq =
      Number.parseFloat(calcUsdValue(hr0, String(p0))) +
      Number.parseFloat(calcUsdValue(hr1, String(p1)));
    totalLiquidity += liq;

    if (liq > topLiq) {
      topLiq = liq;
      topPair = `${s0}/${s1}`;
    }

    return {
      pool_address: pool.address,
      token0: { symbol: s0, reserve: hr0 },
      token1: { symbol: s1, reserve: hr1 },
      liquidity_usd: liq.toFixed(2),
      volume_24h: "N/A",
      fee_rate: pool.lp_fee ?? "0.3%",
      apy: pool.apy_1d,
    };
  });

  return {
    token,
    pools: poolDataList,
    summary: {
      total_liquidity_usd: totalLiquidity.toFixed(2),
      pool_count: poolDataList.length,
      top_pair: topPair,
    },
  };
}

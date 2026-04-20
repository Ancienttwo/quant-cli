import type { Asset, Pool } from "../types/api.js";
import { getAssets, getPools } from "./stonfi.js";

const CACHE_TTL_MS = 300_000; // 5 minutes

interface CacheEntry<T> {
  readonly data: T;
  readonly timestamp: number;
}

let assetsCache: CacheEntry<Asset[]> | null = null;
let poolsCache: CacheEntry<Pool[]> | null = null;

function isFresh<T>(entry: CacheEntry<T> | null): entry is CacheEntry<T> {
  if (!entry) return false;
  return Date.now() - entry.timestamp <= CACHE_TTL_MS;
}

/**
 * Get all assets with TTL caching.
 */
export async function cachedGetAssets(): Promise<Asset[]> {
  if (isFresh(assetsCache)) {
    return assetsCache.data;
  }
  const data = await getAssets();
  assetsCache = { data, timestamp: Date.now() };
  return data;
}

/**
 * Get all pools with TTL caching.
 */
export async function cachedGetPools(): Promise<Pool[]> {
  if (isFresh(poolsCache)) {
    return poolsCache.data;
  }
  const data = await getPools();
  poolsCache = { data, timestamp: Date.now() };
  return data;
}

/**
 * Build a price index: contract_address -> USD price string.
 */
export function buildPriceIndex(assets: Asset[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const asset of assets) {
    const price = asset.dex_usd_price ?? asset.dex_price_usd ?? null;
    if (price) {
      index.set(asset.contract_address, price);
    }
  }
  return index;
}

/**
 * Find an asset by symbol (case-insensitive) from cached assets.
 */
export async function cachedFindAssetBySymbol(symbol: string): Promise<Asset | undefined> {
  const assets = await cachedGetAssets();
  const upper = symbol.toUpperCase();
  return assets.find((a) => a.symbol.toUpperCase() === upper);
}

/**
 * Find all assets by symbol (case-insensitive) from cached assets.
 */
export async function cachedFindAssetsBySymbol(symbol: string): Promise<Asset[]> {
  const assets = await cachedGetAssets();
  const upper = symbol.toUpperCase();
  return assets.filter((a) => a.symbol.toUpperCase() === upper);
}

/**
 * Clear all caches (for testing).
 */
export function clearCache(): void {
  assetsCache = null;
  poolsCache = null;
}

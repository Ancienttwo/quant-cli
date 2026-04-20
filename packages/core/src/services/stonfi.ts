import { z } from "zod";
import { ServiceError } from "../errors.js";
import type { Asset, Pool, SwapSimulateParams, SwapSimulateResponse } from "../types/api.js";
import { AssetSchema, PoolSchema, SwapSimulateResponseSchema } from "../types/api.js";

const BASE_URL = "https://api.ston.fi/v1";

/**
 * Make a GET request to STON.fi API with Zod validation.
 */
async function stonfiGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new ServiceError(
      `STON.fi API error: ${response.status} ${response.statusText}`,
      "STONFI_API_ERROR",
    );
  }

  const json = await response.json();
  return schema.parse(json);
}

/**
 * Get all assets from STON.fi.
 */
export async function getAssets(): Promise<Asset[]> {
  const result = await stonfiGet("/assets", z.object({ asset_list: z.array(AssetSchema) }));
  return result.asset_list;
}

/**
 * Find an asset by symbol (case-insensitive).
 */
export async function findAssetBySymbol(symbol: string): Promise<Asset | undefined> {
  const assets = await getAssets();
  const upperSymbol = symbol.toUpperCase();
  return assets.find((a) => a.symbol.toUpperCase() === upperSymbol);
}

/**
 * Get all pools from STON.fi.
 */
export async function getPools(): Promise<Pool[]> {
  const result = await stonfiGet("/pools", z.object({ pool_list: z.array(PoolSchema) }));
  return result.pool_list;
}

/**
 * Find a pool by token pair addresses.
 */
export async function findPool(
  token0Address: string,
  token1Address: string,
): Promise<Pool | undefined> {
  const pools = await getPools();
  return pools.find(
    (p) =>
      (p.token0_address === token0Address && p.token1_address === token1Address) ||
      (p.token0_address === token1Address && p.token1_address === token0Address),
  );
}

/**
 * Simulate a swap on STON.fi.
 */
export async function simulateSwap(params: SwapSimulateParams): Promise<SwapSimulateResponse> {
  const url = `${BASE_URL}/swap/simulate`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new ServiceError(
      `STON.fi swap simulate error: ${response.status} ${response.statusText}`,
      "STONFI_SWAP_ERROR",
    );
  }

  const json = await response.json();
  return SwapSimulateResponseSchema.parse(json);
}

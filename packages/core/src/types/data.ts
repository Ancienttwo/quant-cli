import { z } from "zod";

// ============================================================
// Domain Data Schemas
// ============================================================

export const PriceDataSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  address: z.string(),
  decimals: z.number(),
  price_usd: z.string(),
  change_24h: z.string(),
  volume_24h: z.string(),
  market_cap: z.string().optional(),
});
export type PriceData = z.infer<typeof PriceDataSchema>;

export const PoolDataSchema = z.object({
  pool_address: z.string(),
  token0: z.object({ symbol: z.string(), reserve: z.string() }),
  token1: z.object({ symbol: z.string(), reserve: z.string() }),
  liquidity_usd: z.string(),
  volume_24h: z.string(),
  fee_rate: z.string(),
  apy: z.string().optional(),
});
export type PoolData = z.infer<typeof PoolDataSchema>;

export const TrendingTokenSchema = z.object({
  rank: z.number(),
  symbol: z.string(),
  price_usd: z.string(),
  change_24h: z.string(),
  volume_24h: z.string(),
});

export const TrendingDataSchema = z.object({
  tokens: z.array(TrendingTokenSchema),
});
export type TrendingData = z.infer<typeof TrendingDataSchema>;

export const BalanceDataSchema = z.object({
  address: z.string(),
  network: z.string(),
  toncoin: z.object({ balance: z.string(), usd_value: z.string() }),
  jettons: z.array(
    z.object({
      symbol: z.string(),
      balance: z.string(),
      usd_value: z.string(),
    }),
  ),
  total_usd: z.string(),
});
export type BalanceData = z.infer<typeof BalanceDataSchema>;

export const SwapSimulationDataSchema = z.object({
  type: z.literal("simulation"),
  from: z.object({ symbol: z.string(), amount: z.string(), amount_usd: z.string() }),
  to: z.object({ symbol: z.string(), expected_amount: z.string(), amount_usd: z.string() }),
  price_impact: z.string(),
  fee: z.string(),
  minimum_received: z.string(),
  slippage_tolerance: z.string(),
  route: z.array(z.string()),
});
export type SwapSimulationData = z.infer<typeof SwapSimulationDataSchema>;

export const SwapExecutionDataSchema = z.object({
  type: z.literal("execution"),
  tx_hash: z.string(),
  status: z.string(),
  from: z.object({ symbol: z.string(), amount: z.string() }),
  to: z.object({ symbol: z.string(), expected_amount: z.string() }),
  explorer_url: z.string(),
});
export type SwapExecutionData = z.infer<typeof SwapExecutionDataSchema>;

export const HistoryTransactionSchema = z.object({
  event_id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  description: z.string(),
  status: z.string(),
});

export const HistoryDataSchema = z.object({
  address: z.string(),
  transactions: z.array(HistoryTransactionSchema),
  total: z.number(),
});
export type HistoryData = z.infer<typeof HistoryDataSchema>;

export const ResearchDataSchema = z.object({
  token: PriceDataSchema,
  pools: z.array(PoolDataSchema),
  summary: z.object({
    total_liquidity_usd: z.string(),
    pool_count: z.number(),
    top_pair: z.string(),
  }),
});
export type ResearchData = z.infer<typeof ResearchDataSchema>;

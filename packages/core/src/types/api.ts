import { z } from "zod";

// ============================================================
// STON.fi API Response Schemas
// ============================================================

/** STON.fi asset (token) */
export const AssetSchema = z.object({
  contract_address: z.string(),
  symbol: z.string(),
  display_name: z.string().optional(),
  decimals: z.number(),
  image_url: z.string().nullish(),
  dex_usd_price: z.string().nullish(),
  dex_price_usd: z.string().nullish(),
});
export type Asset = z.infer<typeof AssetSchema>;

/** STON.fi liquidity pool */
export const PoolSchema = z.object({
  address: z.string(),
  token0_address: z.string(),
  token1_address: z.string(),
  reserve0: z.string(),
  reserve1: z.string(),
  lp_fee: z.string().optional(),
  protocol_fee: z.string().optional(),
  collected_token0_protocol_fee: z.string().optional(),
  collected_token1_protocol_fee: z.string().optional(),
  apy_1d: z.string().optional(),
  apy_7d: z.string().optional(),
  apy_30d: z.string().optional(),
  volume_24h_usd: z.string().nullish(),
  deprecated: z.boolean().optional(),
});
export type Pool = z.infer<typeof PoolSchema>;

/** STON.fi swap simulation request params */
export const SwapSimulateParamsSchema = z.object({
  offer_address: z.string(),
  ask_address: z.string(),
  units: z.string(),
  slippage_tolerance: z.string(),
});
export type SwapSimulateParams = z.infer<typeof SwapSimulateParamsSchema>;

/** STON.fi swap simulation response */
export const SwapSimulateResponseSchema = z.object({
  offer_address: z.string(),
  ask_address: z.string(),
  offer_units: z.string(),
  ask_units: z.string(),
  swap_rate: z.string(),
  price_impact: z.string(),
  min_ask_units: z.string(),
  fee_address: z.string().optional(),
  fee_units: z.string().optional(),
  fee_percent: z.string().optional(),
  route: z.array(z.string()).optional(),
});
export type SwapSimulateResponse = z.infer<typeof SwapSimulateResponseSchema>;

// ============================================================
// TonAPI Response Schemas
// ============================================================

/** TonAPI account balance */
export const TonBalanceSchema = z.object({
  address: z.string(),
  balance: z.coerce.string(),
  status: z.string(),
});
export type TonBalance = z.infer<typeof TonBalanceSchema>;

/** TonAPI jetton balance */
export const JettonBalanceSchema = z.object({
  balance: z.string(),
  jetton: z.object({
    address: z.string(),
    name: z.string(),
    symbol: z.string(),
    decimals: z.number(),
    image: z.string().optional(),
  }),
});
export type JettonBalance = z.infer<typeof JettonBalanceSchema>;

/** TonAPI transaction event */
export const TransactionEventSchema = z.object({
  event_id: z.string(),
  timestamp: z.number(),
  actions: z.array(
    z.object({
      type: z.string(),
      status: z.string(),
      simple_preview: z
        .object({
          name: z.string(),
          description: z.string(),
        })
        .optional(),
    }),
  ),
  is_scam: z.boolean().optional(),
});
export type TransactionEvent = z.infer<typeof TransactionEventSchema>;

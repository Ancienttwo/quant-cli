import { z } from "zod";

// Re-export domain data types from core
export {
  type BalanceData,
  BalanceDataSchema,
  type HistoryData,
  HistoryDataSchema,
  HistoryTransactionSchema,
  type MarketCandle,
  MarketCandleSchema,
  type MarketCandlesData,
  MarketCandlesDataSchema,
  type MarketCompareData,
  MarketCompareDataSchema,
  type MarketInstrumentCandidate,
  MarketInstrumentCandidateSchema,
  type MarketProvider,
  MarketProviderSchema,
  type MarketQuoteData,
  MarketQuoteDataSchema,
  type MarketSearchData,
  MarketSearchDataSchema,
  type MarketTrustMetadata,
  MarketTrustMetadataSchema,
  type PoolData,
  PoolDataSchema,
  type PriceData,
  PriceDataSchema,
  type ResearchData,
  ResearchDataSchema,
  type SwapExecutionData,
  SwapExecutionDataSchema,
  type SwapSimulationData,
  SwapSimulationDataSchema,
  type TrendingData,
  TrendingDataSchema,
  TrendingTokenSchema,
} from "@tonquant/core";

// ============================================================
// CLI Output Envelope (CLI-specific, stays here)
// ============================================================

export const CliSuccessSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    status: z.literal("ok"),
    data: dataSchema,
  });

export const CliErrorSchema = z.object({
  status: z.literal("error"),
  error: z.string(),
  code: z.string(),
});
export type CliError = z.infer<typeof CliErrorSchema>;

export interface GlobalCliOptions {
  json?: boolean;
  testnet?: boolean;
  config?: string;
}

export const MutationChangeSchema = z.object({
  kind: z.enum(["config", "file", "platform-session", "platform-publication", "state"]),
  path: z.string().min(1),
});
export type MutationChange = z.infer<typeof MutationChangeSchema>;

export const MutationReceiptSchema = z.object({
  action: z.string().min(1),
  target: z.string().min(1),
  writes: z.array(MutationChangeSchema).default([]),
  nextStep: z.string().min(1).optional(),
  warnings: z.array(z.string()).default([]),
});
export type MutationReceiptInput = z.input<typeof MutationReceiptSchema>;
export type MutationReceipt = z.infer<typeof MutationReceiptSchema>;

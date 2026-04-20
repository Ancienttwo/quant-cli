import { z } from "zod";

export const OpenBBIntervalSchema = z.enum(["1d"]);
export type OpenBBInterval = z.infer<typeof OpenBBIntervalSchema>;

export const OpenBBHistoricalBarSchema = z.object({
  date: z.union([z.string(), z.date()]),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().int().optional().default(0),
});
export type OpenBBHistoricalBar = z.infer<typeof OpenBBHistoricalBarSchema>;

export const OpenBBWarningSchema = z
  .object({
    message: z.string(),
  })
  .passthrough();
export type OpenBBWarning = z.infer<typeof OpenBBWarningSchema>;

export const OpenBBHistoricalResponseSchema = z.object({
  results: z.array(OpenBBHistoricalBarSchema).default([]),
  provider: z.string().optional(),
  warnings: z.array(OpenBBWarningSchema).optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});
export type OpenBBHistoricalResponse = z.infer<typeof OpenBBHistoricalResponseSchema>;

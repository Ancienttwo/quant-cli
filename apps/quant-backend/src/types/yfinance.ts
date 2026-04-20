import { z } from "zod";

export const YFinanceIntervalSchema = z.enum(["1d", "1h", "15m"]);
export type YFinanceInterval = z.infer<typeof YFinanceIntervalSchema>;

export const YFinanceQuoteSchema = z.object({
  date: z.union([z.date(), z.string(), z.number()]),
  open: z.number().nullable().optional(),
  high: z.number().nullable().optional(),
  low: z.number().nullable().optional(),
  close: z.number().nullable().optional(),
  volume: z.number().nullable().optional(),
});
export type YFinanceQuote = z.infer<typeof YFinanceQuoteSchema>;

export const YFinanceChartResultSchema = z.object({
  quotes: z.array(YFinanceQuoteSchema).default([]),
});
export type YFinanceChartResult = z.infer<typeof YFinanceChartResultSchema>;

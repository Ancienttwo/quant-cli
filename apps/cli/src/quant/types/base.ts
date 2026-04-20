import { join } from "node:path";
import { CONFIG_DIR } from "@tonquant/core";
import { z } from "zod";

export const TONQUANT_QUANT_ROOT = join(CONFIG_DIR, "quant");

export const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected YYYY-MM-DD");

export const AssetClassSchema = z.enum(["crypto", "equity", "bond"]);
export type AssetClass = z.infer<typeof AssetClassSchema>;

export const MarketRegionSchema = z.enum(["ton", "global", "us", "hk", "cn"]);
export type MarketRegion = z.infer<typeof MarketRegionSchema>;

export const VenueCodeSchema = z.enum([
  "stonfi",
  "okx",
  "binance",
  "hyperliquid",
  "nyse",
  "nasdaq",
  "hkex",
  "sse",
  "szse",
  "cibm",
]);
export type VenueCode = z.infer<typeof VenueCodeSchema>;

export const ProviderCodeSchema = z.enum([
  "synthetic",
  "stonfi",
  "tonapi",
  "okx",
  "binance",
  "hyperliquid",
  "yfinance",
  "openbb",
]);
export type ProviderCode = z.infer<typeof ProviderCodeSchema>;

export const CalendarIdSchema = z.enum(["24-7", "XNYS", "XNAS", "XHKG", "XSHG", "XSHE", "CIBM"]);
export type CalendarId = z.infer<typeof CalendarIdSchema>;

export const ProviderSymbolMapSchema = z.record(ProviderCodeSchema, z.string().min(1));
export type ProviderSymbolMap = z.infer<typeof ProviderSymbolMapSchema>;

export const InstrumentRefSchema = z.object({
  id: z.string().min(1),
  assetClass: AssetClassSchema,
  marketRegion: MarketRegionSchema,
  venue: VenueCodeSchema,
  provider: ProviderCodeSchema.default("synthetic"),
  displaySymbol: z.string().min(1),
  providerSymbols: ProviderSymbolMapSchema,
  quoteCurrency: z.string().min(1),
  timezone: z.string().min(1),
  calendarId: CalendarIdSchema,
});
export type InstrumentRef = z.infer<typeof InstrumentRefSchema>;

export const ExecutionVenueRefSchema = z.object({
  broker: z.string().min(1),
  marketRegion: MarketRegionSchema,
  venue: VenueCodeSchema,
});
export type ExecutionVenueRef = z.infer<typeof ExecutionVenueRefSchema>;

export const BrokerCapabilitiesSchema = z.object({
  supportsEquities: z.boolean().default(false),
  supportsCrypto: z.boolean().default(false),
  supportsBonds: z.boolean().default(false),
  supportsFractionalShares: z.boolean().default(false),
  supportsShortSelling: z.boolean().default(false),
  supportsRealtimeQuotes: z.boolean().default(false),
});
export type BrokerCapabilities = z.infer<typeof BrokerCapabilitiesSchema>;

export const DataModeSchema = z.enum(["cached", "live", "derived"]);
export type DataMode = z.infer<typeof DataModeSchema>;

export const QuantParamValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type QuantParamValue = z.infer<typeof QuantParamValueSchema>;

export const ArtifactKindSchema = z.enum(["json", "log", "dataset", "table", "chart", "file"]);
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

export const ArtifactRefSchema = z.object({
  path: z.string().min(1),
  label: z.string().min(1).optional(),
  kind: ArtifactKindSchema.default("file"),
});
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;

export const QuantRunStatusSchema = z.enum([
  "idle",
  "running",
  "completed",
  "cancelled",
  "failed",
  "blocked",
  "pending-review",
]);
export type QuantRunStatus = z.infer<typeof QuantRunStatusSchema>;

export const QuantRunMetaSchema = z.object({
  runId: z.string().min(1),
  status: QuantRunStatusSchema,
  summary: z.string().nullable().optional(),
  artifacts: z.array(ArtifactRefSchema).default([]),
});
export type QuantRunMeta = z.infer<typeof QuantRunMetaSchema>;

export const QuantArtifactDomainSchema = z.enum([
  "data-fetch",
  "factors",
  "signals",
  "backtests",
  "presets",
  "autoresearch",
  "autoresearch-runs",
  "automation-runs",
]);
export type QuantArtifactDomain = z.infer<typeof QuantArtifactDomainSchema>;

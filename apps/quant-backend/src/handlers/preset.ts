/**
 * Preset handler — hardcoded strategy presets for demo.
 */

import { resolveInstrument } from "../market/instruments";

interface PresetDetail {
  id: string;
  name: string;
  description: string;
  strategy: string;
  assetClass: string;
  marketRegion: string;
  venue: string;
  provider: string;
  symbols: string[];
  instruments: unknown[];
  params: Record<string, unknown>;
  paramRanges: Record<string, { min: number; max: number; step?: number }>;
  costConfig?: Record<string, unknown>;
  thesis?: string;
}

const PRESETS: PresetDetail[] = [
  {
    id: "momentum-ton",
    name: "TON Momentum",
    description: "SMA crossover momentum strategy for TON/USDT",
    strategy: "momentum",
    assetClass: "crypto",
    marketRegion: "ton",
    venue: "stonfi",
    provider: "stonfi",
    symbols: ["TON/USDT"],
    instruments: [
      resolveInstrument({
        symbol: "TON/USDT",
        assetClass: "crypto",
        marketRegion: "ton",
        venue: "stonfi",
        provider: "stonfi",
      }),
    ],
    params: {
      fast_period: 10,
      slow_period: 30,
    },
    paramRanges: {
      fast_period: { min: 5, max: 20, step: 1 },
      slow_period: { min: 20, max: 50, step: 5 },
    },
    costConfig: {
      slippage: { model: "percentage", value: 0.001 },
      borrowRateAnnual: 0,
    },
    thesis: "TON exhibits strong momentum due to Telegram ecosystem catalysts",
  },
  {
    id: "conservative-ton",
    name: "TON Conservative",
    description: "Slow SMA crossover with tight risk control",
    strategy: "momentum",
    assetClass: "crypto",
    marketRegion: "ton",
    venue: "stonfi",
    provider: "stonfi",
    symbols: ["TON/USDT"],
    instruments: [
      resolveInstrument({
        symbol: "TON/USDT",
        assetClass: "crypto",
        marketRegion: "ton",
        venue: "stonfi",
        provider: "stonfi",
      }),
    ],
    params: {
      fast_period: 20,
      slow_period: 50,
    },
    paramRanges: {
      fast_period: { min: 15, max: 30, step: 5 },
      slow_period: { min: 40, max: 60, step: 5 },
    },
    costConfig: {
      slippage: { model: "percentage", value: 0.002 },
      borrowRateAnnual: 0,
    },
    thesis: "Fewer trades, lower risk for longer-term position holding",
  },
  {
    id: "aggressive-ton",
    name: "TON Aggressive",
    description: "Fast SMA crossover for short-term momentum",
    strategy: "momentum",
    assetClass: "crypto",
    marketRegion: "ton",
    venue: "stonfi",
    provider: "stonfi",
    symbols: ["TON/USDT"],
    instruments: [
      resolveInstrument({
        symbol: "TON/USDT",
        assetClass: "crypto",
        marketRegion: "ton",
        venue: "stonfi",
        provider: "stonfi",
      }),
    ],
    params: {
      fast_period: 5,
      slow_period: 15,
    },
    paramRanges: {
      fast_period: { min: 3, max: 10, step: 1 },
      slow_period: { min: 10, max: 25, step: 1 },
    },
    costConfig: {
      slippage: { model: "percentage", value: 0.001 },
      borrowRateAnnual: 0,
    },
    thesis: "Capture short-term price moves with higher trade frequency",
  },
  {
    id: "momentum-aapl",
    name: "AAPL Momentum",
    description: "SMA crossover momentum strategy for AAPL",
    strategy: "momentum",
    assetClass: "equity",
    marketRegion: "us",
    venue: "nasdaq",
    provider: "yfinance",
    symbols: ["AAPL"],
    instruments: [
      resolveInstrument({
        symbol: "AAPL",
        assetClass: "equity",
        marketRegion: "us",
        venue: "nasdaq",
        provider: "yfinance",
      }),
    ],
    params: {
      fast_period: 20,
      slow_period: 50,
    },
    paramRanges: {
      fast_period: { min: 10, max: 30, step: 5 },
      slow_period: { min: 40, max: 80, step: 5 },
    },
    costConfig: {
      slippage: { model: "percentage", value: 0.0005 },
      borrowRateAnnual: 0,
    },
    thesis: "Capture medium-term momentum in mega-cap US equities.",
  },
  {
    id: "momentum-0700-hk",
    name: "Tencent Momentum",
    description: "SMA crossover momentum strategy for Tencent Holdings",
    strategy: "momentum",
    assetClass: "equity",
    marketRegion: "hk",
    venue: "hkex",
    provider: "yfinance",
    symbols: ["0700"],
    instruments: [
      resolveInstrument({
        symbol: "0700",
        assetClass: "equity",
        marketRegion: "hk",
        venue: "hkex",
        provider: "yfinance",
      }),
    ],
    params: {
      fast_period: 15,
      slow_period: 45,
    },
    paramRanges: {
      fast_period: { min: 10, max: 30, step: 5 },
      slow_period: { min: 30, max: 80, step: 5 },
    },
    costConfig: {
      slippage: { model: "percentage", value: 0.0008 },
      borrowRateAnnual: 0,
    },
    thesis: "Capture medium-term momentum in liquid Hong Kong internet bellwethers.",
  },
  {
    id: "momentum-600519-cn",
    name: "Kweichow Moutai Momentum",
    description: "SMA crossover momentum strategy for Kweichow Moutai",
    strategy: "momentum",
    assetClass: "equity",
    marketRegion: "cn",
    venue: "sse",
    provider: "yfinance",
    symbols: ["600519"],
    instruments: [
      resolveInstrument({
        symbol: "600519",
        assetClass: "equity",
        marketRegion: "cn",
        venue: "sse",
        provider: "yfinance",
      }),
    ],
    params: {
      fast_period: 20,
      slow_period: 60,
    },
    paramRanges: {
      fast_period: { min: 10, max: 30, step: 5 },
      slow_period: { min: 40, max: 100, step: 10 },
    },
    costConfig: {
      slippage: { model: "percentage", value: 0.0007 },
      borrowRateAnnual: 0,
    },
    thesis: "Track momentum persistence in high-quality A-share leaders on the main board.",
  },
];

export function handlePresetList(_input: Record<string, unknown>): Record<string, unknown> {
  return {
    status: "completed",
    summary: `${PRESETS.length} presets available`,
    artifacts: [],
    presets: PRESETS.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      strategy: p.strategy,
    })),
  };
}

export function handlePresetShow(input: Record<string, unknown>): Record<string, unknown> {
  const presetId = (input.presetId as string) ?? "";
  const preset = PRESETS.find((p) => p.id === presetId);

  if (!preset) {
    const available = PRESETS.map((p) => p.id).join(", ");
    throw new Error(`Preset not found: "${presetId}". Available: ${available}`);
  }

  return {
    status: "completed",
    summary: `Preset: ${preset.name}`,
    artifacts: [],
    preset,
  };
}

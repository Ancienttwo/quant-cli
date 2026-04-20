import type { AssetClass, MarketRegion, ProviderCode } from "../types/base.js";

export function providerCompatibilityError(input: {
  assetClass: AssetClass;
  marketRegion: MarketRegion;
  provider: ProviderCode;
}): string | null {
  if (input.provider === "yfinance" && input.assetClass !== "equity") {
    return `Unsupported provider 'yfinance' for market '${input.assetClass}/${input.marketRegion}'.`;
  }
  if (
    input.provider === "openbb" &&
    !(input.assetClass === "equity" && (input.marketRegion === "hk" || input.marketRegion === "cn"))
  ) {
    return `Unsupported provider 'openbb' for market '${input.assetClass}/${input.marketRegion}'.`;
  }
  if (
    (input.provider === "stonfi" || input.provider === "tonapi") &&
    !(input.assetClass === "crypto" && input.marketRegion === "ton")
  ) {
    return `Unsupported provider '${input.provider}' for market '${input.assetClass}/${input.marketRegion}'.`;
  }
  if (
    (input.provider === "okx" ||
      input.provider === "binance" ||
      input.provider === "hyperliquid") &&
    !(input.assetClass === "crypto" && input.marketRegion === "global")
  ) {
    return `Unsupported provider '${input.provider}' for market '${input.assetClass}/${input.marketRegion}'.`;
  }
  return null;
}

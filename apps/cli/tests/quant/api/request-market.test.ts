import { describe, expect, test } from "bun:test";
import { ServiceError } from "@tonquant/core";
import {
  resolveInstrumentSelection,
  withResolvedInstruments,
} from "../../../src/quant/api/request-market";

describe("request-market", () => {
  test("rejects crypto requests for yfinance during instrument resolution", () => {
    try {
      withResolvedInstruments({
        symbols: ["TON/USDT"],
        assetClass: "crypto",
        marketRegion: "ton",
        provider: "yfinance",
      });
      throw new Error("Expected yfinance crypto resolution to throw.");
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceError);
      expect((error as ServiceError).code).toBe("QUANT_PROVIDER_UNSUPPORTED");
      expect((error as Error).message).toBe(
        "Unsupported provider 'yfinance' for market 'crypto/ton'.",
      );
    }
  });

  test("normalizes venue and instruments consistently for canonical market selection", () => {
    const result = resolveInstrumentSelection({
      symbols: ["AAPL"],
      assetClass: "equity",
      marketRegion: "us",
      provider: "yfinance",
    });

    expect(result.provider).toBe("yfinance");
    expect(result.venue).toBe("nyse");
    expect(result.instruments[0]?.provider).toBe("yfinance");
    expect(result.instruments[0]?.venue).toBe("nyse");
  });

  test("defaults HK market selection to runnable yfinance provider", () => {
    const result = resolveInstrumentSelection({
      symbols: ["0700"],
      assetClass: "equity",
      marketRegion: "hk",
    });

    expect(result.provider).toBe("yfinance");
    expect(result.venue).toBe("hkex");
    expect(result.instruments[0]?.provider).toBe("yfinance");
    expect(result.instruments[0]?.providerSymbols.yfinance).toBe("0700.HK");
  });

  test("rejects openbb for unsupported US equity requests", () => {
    try {
      withResolvedInstruments({
        symbols: ["AAPL"],
        assetClass: "equity",
        marketRegion: "us",
        provider: "openbb",
      });
      throw new Error("Expected unsupported openbb US resolution to throw.");
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceError);
      expect((error as ServiceError).code).toBe("QUANT_PROVIDER_UNSUPPORTED");
      expect((error as Error).message).toBe(
        "Unsupported provider 'openbb' for market 'equity/us'.",
      );
    }
  });

  test("defaults global crypto selection to OKX", () => {
    const result = resolveInstrumentSelection({
      symbols: ["BTC"],
      assetClass: "crypto",
      marketRegion: "global",
    });

    expect(result.provider).toBe("okx");
    expect(result.venue).toBe("okx");
    expect(result.instruments[0]?.providerSymbols.okx).toBe("BTC-USDT");
  });

  test("resolves explicit Hyperliquid global crypto requests", () => {
    const result = resolveInstrumentSelection({
      symbols: ["BTC"],
      assetClass: "crypto",
      marketRegion: "global",
      provider: "hyperliquid",
    });

    expect(result.provider).toBe("hyperliquid");
    expect(result.venue).toBe("hyperliquid");
    expect(result.instruments[0]?.providerSymbols.hyperliquid).toBe("BTC");
  });

  test("resolves explicit Binance global crypto requests as a secondary provider", () => {
    const result = resolveInstrumentSelection({
      symbols: ["BTC"],
      assetClass: "crypto",
      marketRegion: "global",
      provider: "binance",
    });

    expect(result.provider).toBe("binance");
    expect(result.venue).toBe("binance");
    expect(result.instruments[0]?.providerSymbols.binance).toBe("BTCUSDT");
  });
});

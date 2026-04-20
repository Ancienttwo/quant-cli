import { describe, expect, test } from "bun:test";
import {
  makeFactor,
  makeFactorEntry,
} from "../../../../packages/core/tests/helpers/factor-fixtures.js";
import type {
  BalanceData,
  HistoryData,
  MarketCandlesData,
  MarketCompareData,
  MarketSearchData,
  PoolData,
  PriceData,
  ResearchData,
  SwapSimulationData,
  TrendingData,
} from "../../src/types/cli.js";
import {
  formatBalance,
  formatHistory,
  formatMarketCandles,
  formatMarketCompare,
  formatMarketSearch,
  formatPool,
  formatPrice,
  formatResearch,
  formatSwapSimulation,
  formatTrending,
  greenRed,
} from "../../src/utils/format.js";
import {
  formatPlatformPrepared,
  formatPlatformPublicationStatus,
  formatPlatformSigningSession,
} from "../../src/utils/format-platform.js";
import {
  formatDataFetch,
  formatDataInfo,
  formatAutoresearchList as formatQuantAutoresearchList,
  formatAutoresearchResult as formatQuantAutoresearchResult,
} from "../../src/utils/format-quant.js";

describe("greenRed", () => {
  test("returns green-styled string for positive values", () => {
    expect(greenRed("+3.2%")).toContain("+3.2%");
  });

  test("returns red-styled string for negative values", () => {
    expect(greenRed("-1.5%")).toContain("-1.5%");
  });

  test("returns gray-styled string for neutral values", () => {
    expect(greenRed("0%")).toContain("0%");
  });
});

describe("formatPrice", () => {
  test("formats price data with symbol and price", () => {
    const data: PriceData = {
      symbol: "NOT",
      name: "Notcoin",
      address: "EQ...",
      decimals: 9,
      price_usd: "0.0068",
      change_24h: "+3.2%",
      volume_24h: "1200000",
    };
    const result = formatPrice(data);
    expect(result).toContain("NOT");
    expect(result).toContain("Notcoin");
    expect(result).toContain("0.0068");
  });
});

describe("formatPool", () => {
  test("formats pool data as table", () => {
    const data: PoolData = {
      pool_address: "EQ_pool",
      token0: { symbol: "NOT", reserve: "100000" },
      token1: { symbol: "TON", reserve: "500" },
      liquidity_usd: "2850.00",
      volume_24h: "N/A",
      fee_rate: "0.3%",
      apy: "12.5%",
    };
    const result = formatPool(data);
    expect(result).toContain("NOT");
    expect(result).toContain("TON");
    expect(result).toContain("2850.00");
    expect(result).toContain("0.3%");
  });
});

describe("formatTrending", () => {
  test("formats trending data as table", () => {
    const data: TrendingData = {
      tokens: [
        { rank: 1, symbol: "NOT", price_usd: "0.0068", change_24h: "+12.5%", volume_24h: "N/A" },
        { rank: 2, symbol: "DOGS", price_usd: "0.0005", change_24h: "+8.3%", volume_24h: "N/A" },
      ],
    };
    const result = formatTrending(data);
    expect(result).toContain("NOT");
    expect(result).toContain("DOGS");
  });
});

describe("formatBalance", () => {
  test("formats balance data", () => {
    const data: BalanceData = {
      address: "UQ_test",
      network: "mainnet",
      toncoin: { balance: "12.5", usd_value: "46.25" },
      jettons: [{ symbol: "NOT", balance: "5000", usd_value: "34.00" }],
      total_usd: "80.25",
    };
    const result = formatBalance(data);
    expect(result).toContain("UQ_test");
    expect(result).toContain("12.5");
    expect(result).toContain("NOT");
    expect(result).toContain("80.25");
  });
});

describe("formatSwapSimulation", () => {
  test("formats swap simulation data", () => {
    const data: SwapSimulationData = {
      type: "simulation",
      from: { symbol: "NOT", amount: "1000", amount_usd: "6.80" },
      to: { symbol: "TON", expected_amount: "0.368", amount_usd: "6.75" },
      price_impact: "0.1%",
      fee: "0.003",
      minimum_received: "0.364",
      slippage_tolerance: "1%",
      route: ["NOT → TON"],
    };
    const result = formatSwapSimulation(data);
    expect(result).toContain("Swap Simulation");
    expect(result).toContain("NOT");
    expect(result).toContain("0.368");
    expect(result).toContain("0.1%");
  });
});

describe("formatHistory", () => {
  test("formats history data as table", () => {
    const data: HistoryData = {
      address: "UQ_test",
      transactions: [
        {
          event_id: "e1",
          timestamp: "2024-03-22T00:00:00Z",
          type: "TonTransfer",
          description: "Sent 1 TON",
          status: "ok",
        },
      ],
      total: 1,
    };
    const result = formatHistory(data);
    expect(result).toContain("UQ_test");
    expect(result).toContain("TonTransfer");
    expect(result).toContain("Sent 1 TON");
  });
});

describe("formatResearch", () => {
  test("formats research report", () => {
    const data: ResearchData = {
      token: {
        symbol: "NOT",
        name: "Notcoin",
        address: "EQ_not",
        decimals: 9,
        price_usd: "0.01",
        change_24h: "N/A",
        volume_24h: "N/A",
      },
      pools: [
        {
          pool_address: "EQ_p",
          token0: { symbol: "NOT", reserve: "100000" },
          token1: { symbol: "TON", reserve: "500" },
          liquidity_usd: "2850.00",
          volume_24h: "N/A",
          fee_rate: "0.3%",
        },
      ],
      summary: { total_liquidity_usd: "2850.00", pool_count: 1, top_pair: "NOT/TON" },
    };
    const result = formatResearch(data);
    expect(result).toContain("Research Liquidity");
    expect(result).toContain("NOT");
    expect(result).toContain("2850.00");
    expect(result).toContain("NOT/TON");
  });
});

describe("market research formatters", () => {
  test("formats research search results under the new heading", () => {
    const data: MarketSearchData = {
      query: "BTC",
      candidates: [
        {
          symbol: "BTC",
          name: "Bitcoin",
          provider: "binance",
          venue: "binance",
          quote_currency: "USDT",
          market_type: "spot",
          provider_symbol: "BTCUSDT",
        },
      ],
    };

    const result = formatMarketSearch(data);
    expect(result).toContain("Research Search");
    expect(result).toContain("BTCUSDT");
  });

  test("formats research compare results under the new heading", () => {
    const data: MarketCompareData = {
      symbol: "BTC",
      quotes: [
        {
          symbol: "BTC",
          name: "Bitcoin",
          price: "100000",
          change_24h_pct: "+1.2%",
          volume_24h: "2000000",
          trust: {
            provider: "binance",
            venue: "binance",
            provider_symbol: "BTCUSDT",
            quote_currency: "USDT",
            market_type: "spot",
            observed_at: "2026-04-13T00:00:00.000Z",
            age_seconds: 3,
          },
        },
        {
          symbol: "BTC",
          name: "Bitcoin",
          price: "100100",
          change_24h_pct: "+1.1%",
          volume_24h: "1800000",
          trust: {
            provider: "hyperliquid",
            venue: "hyperliquid",
            provider_symbol: "BTC",
            quote_currency: "USDT",
            market_type: "perpetual",
            observed_at: "2026-04-13T00:00:01.000Z",
            age_seconds: 2,
          },
        },
      ],
      spread_abs: "100",
      spread_pct: "+0.10%",
    };

    const result = formatMarketCompare(data);
    expect(result).toContain("Research Compare");
    expect(result).toContain("BTCUSDT");
    expect(result).toContain("hyperliquid");
  });

  test("formats research candles results under the new heading", () => {
    const data: MarketCandlesData = {
      symbol: "BTC",
      interval: "1d",
      candles: [
        {
          open_time: "2026-04-12T00:00:00.000Z",
          close_time: "2026-04-13T00:00:00.000Z",
          open: "99900",
          high: "100500",
          low: "99500",
          close: "100100",
          volume: "1234",
        },
      ],
      trust: {
        provider: "binance",
        venue: "binance",
        provider_symbol: "BTCUSDT",
        quote_currency: "USDT",
        market_type: "spot",
        observed_at: "2026-04-13T00:00:00.000Z",
        age_seconds: 4,
      },
    };

    const result = formatMarketCandles(data);
    expect(result).toContain("Research Candles");
    expect(result).toContain("BTCUSDT");
    expect(result).toContain("100100");
  });
});

describe("formatAutoresearchResult", () => {
  test("formats durable track metadata", () => {
    const result = formatQuantAutoresearchResult({
      status: "pending-review",
      baseline: {
        title: "TON Momentum",
        strategy: "momentum",
        symbols: ["TON/USDT"],
        startDate: "2024-01-01",
        endDate: "2024-03-31",
      },
      state: {
        status: "pending-review",
        latestRun: {
          runId: "run-123",
          status: "completed",
          iterationsCompleted: 1,
          iterationsRequested: 1,
        },
        bestCandidateId: null,
        latestCandidateId: "run-123-1",
      },
      candidates: [
        {
          candidateId: "run-123-1",
          status: "pending-review",
          summary: "Recommendation BUY",
        },
      ],
      history: [
        {
          timestamp: "2024-03-31T00:00:00.000Z",
          message: "Run completed",
        },
      ],
    });

    expect(result).toContain("TON Momentum");
    expect(result).toContain("run-123");
    expect(result).toContain("run-123-1");
    expect(result).toContain("Run completed");
  });
});

describe("formatAutoresearchList", () => {
  test("formats track summaries", () => {
    const result = formatQuantAutoresearchList({
      tracks: [
        {
          trackId: "track-1",
          title: "TON Momentum",
          status: "pending-review",
          updatedAt: "2024-03-31T00:00:00.000Z",
          candidateCount: 2,
          pendingPromotionCount: 1,
        },
      ],
    });

    expect(result).toContain("track-1");
    expect(result).toContain("2");
    expect(result).toContain("1");
  });
});

describe("platform formatters", () => {
  const factorEntry = makeFactorEntry("ton_signal_alpha", {
    name: "Alpha",
    description: "Alpha",
    createdAt: "2026-04-09T00:00:00.000Z",
    updatedAt: "2026-04-09T00:00:00.000Z",
    definition: {
      ...makeFactor("ton_signal_alpha").definition,
      universe: {
        ...makeFactor("ton_signal_alpha").definition.universe,
        assets: ["TON"],
      },
      assets: ["TON"],
    },
  });

  test("formats prepared platform publish actions", () => {
    const result = formatPlatformPrepared({
      prepared: {
        action: "publish_factor",
        factorSlug: "ton_signal_alpha",
        factorVersion: "1.0.0",
        publisherAddress: "0:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        payoutAddress: "0:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        network: "mainnet",
        audience: "https://publish.tonquant.test",
        manifest: {
          kind: "tonquant.factor.publish-manifest",
          manifestVersion: "1.0.0",
          factorSlug: "ton_signal_alpha",
          factorVersion: "1.0.0",
          factor: factorEntry,
          preparedAt: "2026-04-09T00:00:00.000Z",
        },
      },
      outputPath: "/tmp/prepared.json",
    });

    expect(result).toContain("Prepared");
    expect(result).toContain("ton_signal_alpha");
    expect(result).toContain("/tmp/prepared.json");
  });

  test("formats platform signing sessions", () => {
    const result = formatPlatformSigningSession({
      sessionId: "sess_123",
      action: "publish_factor",
      factorSlug: "ton_signal_alpha",
      factorVersion: "1.0.0",
      publisherAddress: "0:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      payoutAddress: "0:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      network: "mainnet",
      audience: "https://publish.tonquant.test",
      nonce: "nonce",
      intent: {
        kind: "tonquant.factor.publish-intent",
        action: "publish_factor",
        factorSlug: "ton_signal_alpha",
        factorVersion: "1.0.0",
        publisherAddress: "0:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        payoutAddress: "0:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        manifestSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        nonce: "nonce",
        issuedAt: "2026-04-09T00:00:00.000Z",
        expiresAt: "2026-04-09T00:10:00.000Z",
        audience: "https://publish.tonquant.test",
        chain: "ton",
        network: "mainnet",
      },
      intentText: "{}",
      manifestSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      status: "pending",
      signUrl: "https://publish.tonquant.test/sign?session=sess_123",
      expiresAt: "2026-04-09T00:10:00.000Z",
      createdAt: "2026-04-09T00:00:00.000Z",
    });

    expect(result).toContain("Signature requested");
    expect(result).toContain("sess_123");
    expect(result).toContain("Sign URL");
  });

  test("formats publication status output", () => {
    const result = formatPlatformPublicationStatus({
      publication: {
        publicationId: "pub_123",
        action: "publish_factor",
        factorSlug: "ton_signal_alpha",
        factorVersion: "1.0.0",
        publisherAddress: "0:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        payoutAddress: "0:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        manifest: {
          kind: "tonquant.factor.publish-manifest",
          manifestVersion: "1.0.0",
          factorSlug: "ton_signal_alpha",
          factorVersion: "1.0.0",
          factor: factorEntry,
          preparedAt: "2026-04-09T00:00:00.000Z",
        },
        manifestSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        intent: {
          kind: "tonquant.factor.publish-intent",
          action: "publish_factor",
          factorSlug: "ton_signal_alpha",
          factorVersion: "1.0.0",
          publisherAddress: "0:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          payoutAddress: "0:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          manifestSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          nonce: "nonce",
          issuedAt: "2026-04-09T00:00:00.000Z",
          expiresAt: "2026-04-09T00:10:00.000Z",
          audience: "https://publish.tonquant.test",
          chain: "ton",
          network: "mainnet",
        },
        status: "active",
        createdAt: "2026-04-09T00:00:00.000Z",
        updatedAt: "2026-04-09T00:01:00.000Z",
        signedAt: "2026-04-09T00:00:30.000Z",
      },
      activeVersion: {
        factorSlug: "ton_signal_alpha",
        factorVersion: "1.0.0",
        manifestSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        activatedAt: "2026-04-09T00:01:00.000Z",
      },
    });

    expect(result).toContain("pub_123");
    expect(result).toContain("Active version");
    expect(result).toContain("ton_signal_alpha");
  });
});

describe("quant data formatters", () => {
  test("formatDataFetch preserves per-instrument bar counts", () => {
    const result = formatDataFetch({
      fetchedSymbols: ["BTC-USD", "AAPL"],
      datasets: [
        {
          symbol: "BTC-USD",
          instrument: {
            displaySymbol: "BTC-USD",
            assetClass: "crypto",
            marketRegion: "ton",
            venue: "stonfi",
            provider: "yfinance",
          },
          interval: "1d",
          barCount: 365,
        },
        {
          symbol: "AAPL",
          instrument: {
            displaySymbol: "AAPL",
            assetClass: "equity",
            marketRegion: "us",
            venue: "nasdaq",
            provider: "yfinance",
          },
          interval: "1d",
          barCount: 252,
        },
      ],
      cacheHits: 0,
      cacheMisses: 2,
      barCount: 617,
    });

    expect(result).toContain("365");
    expect(result).toContain("252");
    expect(result).toContain("yfinance");
  });

  test("formatDataInfo shows provider-aware dataset metadata", () => {
    const result = formatDataInfo({
      dataset: {
        symbol: "0700",
        instrument: {
          assetClass: "equity",
          marketRegion: "hk",
          venue: "hkex",
          provider: "yfinance",
        },
        interval: "1d",
        barCount: 200,
        startDate: "2024-01-02",
        endDate: "2024-10-31",
      },
    });

    expect(result).toContain("yfinance");
    expect(result).toContain("hk");
    expect(result).toContain("200");
  });
});

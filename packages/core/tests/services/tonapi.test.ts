import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { getBalance, getJettonBalances, getTransactions } from "../../src/services/tonapi.js";

let fetchSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  fetchSpy = spyOn(globalThis, "fetch");
});

afterEach(() => {
  fetchSpy.mockRestore();
});

function mockResponse(data: unknown, status = 200) {
  return (() =>
    Promise.resolve(
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    )) as unknown as typeof fetch;
}

describe("getBalance", () => {
  test("returns validated balance", async () => {
    fetchSpy.mockImplementation(
      mockResponse({ address: "UQ_test", balance: "12500000000", status: "active" }),
    );
    const result = await getBalance("UQ_test");
    expect(result.address).toBe("UQ_test");
    expect(result.balance).toBe("12500000000");
    expect(result.status).toBe("active");
  });

  test("throws on HTTP error", async () => {
    fetchSpy.mockImplementation(mockResponse({}, 404));
    await expect(getBalance("UQ_bad")).rejects.toThrow("TonAPI error");
  });
});

describe("getJettonBalances", () => {
  test("returns validated jetton array", async () => {
    const mockJettons = {
      balances: [
        {
          balance: "5000000000",
          jetton: { address: "EQ_jetton", name: "Test", symbol: "TST", decimals: 9 },
        },
      ],
    };
    fetchSpy.mockImplementation(mockResponse(mockJettons));
    const result = await getJettonBalances("UQ_test");
    expect(result).toHaveLength(1);
    expect(result[0]?.jetton.symbol).toBe("TST");
  });
});

describe("getTransactions", () => {
  test("returns validated event array", async () => {
    const mockEvents = {
      events: [
        {
          event_id: "evt_1",
          timestamp: 1711100000,
          actions: [{ type: "TonTransfer", status: "ok" }],
        },
      ],
    };
    fetchSpy.mockImplementation(mockResponse(mockEvents));
    const result = await getTransactions("UQ_test", 10);
    expect(result).toHaveLength(1);
    expect(result[0]?.event_id).toBe("evt_1");
    expect(result[0]?.actions[0]?.type).toBe("TonTransfer");
  });

  test("uses default limit", async () => {
    fetchSpy.mockImplementation(mockResponse({ events: [] }));
    const result = await getTransactions("UQ_test");
    expect(result).toHaveLength(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

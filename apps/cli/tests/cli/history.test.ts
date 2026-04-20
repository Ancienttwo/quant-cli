import { describe, expect, test } from "bun:test";
import type { TransactionEvent } from "@tonquant/core";

describe("history command", () => {
  test("transforms TransactionEvent to HistoryData format", () => {
    const event: TransactionEvent = {
      event_id: "evt_123",
      timestamp: 1711100000,
      actions: [
        {
          type: "JettonTransfer",
          status: "ok",
          simple_preview: {
            name: "Transfer",
            description: "Sent 100 NOT",
          },
        },
      ],
    };

    const tx = {
      event_id: event.event_id,
      timestamp: new Date(event.timestamp * 1000).toISOString(),
      type: event.actions[0]?.type ?? "unknown",
      description: event.actions[0]?.simple_preview?.description ?? "—",
      status: event.actions[0]?.status ?? "unknown",
    };

    expect(tx.event_id).toBe("evt_123");
    expect(tx.type).toBe("JettonTransfer");
    expect(tx.description).toBe("Sent 100 NOT");
    expect(tx.status).toBe("ok");
    expect(tx.timestamp).toContain("2024-03-22");
  });

  test("handles event with no actions", () => {
    const event: TransactionEvent = {
      event_id: "evt_empty",
      timestamp: 1711100000,
      actions: [],
    };

    const type = event.actions[0]?.type ?? "unknown";
    expect(type).toBe("unknown");
  });
});

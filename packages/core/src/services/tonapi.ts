import { z } from "zod";
import { ServiceError } from "../errors.js";
import type { JettonBalance, TonBalance, TransactionEvent } from "../types/api.js";
import { JettonBalanceSchema, TonBalanceSchema, TransactionEventSchema } from "../types/api.js";

const BASE_URL = "https://tonapi.io/v2";

/**
 * Make a GET request to TonAPI with Zod validation.
 */
async function tonapiGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new ServiceError(
      `TonAPI error: ${response.status} ${response.statusText}`,
      "TONAPI_ERROR",
    );
  }

  const json = await response.json();
  return schema.parse(json);
}

/**
 * Get TON balance for an address.
 */
export async function getBalance(address: string): Promise<TonBalance> {
  return tonapiGet(`/accounts/${address}`, TonBalanceSchema);
}

/**
 * Get all jetton balances for an address.
 */
export async function getJettonBalances(address: string): Promise<JettonBalance[]> {
  const result = await tonapiGet(
    `/accounts/${address}/jettons`,
    z.object({ balances: z.array(JettonBalanceSchema) }),
  );
  return result.balances;
}

/**
 * Get transaction events for an address.
 */
export async function getTransactions(address: string, limit = 20): Promise<TransactionEvent[]> {
  const result = await tonapiGet(
    `/accounts/${address}/events?limit=${limit}`,
    z.object({ events: z.array(TransactionEventSchema) }),
  );
  return result.events;
}

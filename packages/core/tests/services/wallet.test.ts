import { describe, expect, test } from "bun:test";
import { ServiceError } from "../../src/errors.js";
import { getWalletAddress } from "../../src/services/wallet.js";
import type { Config } from "../../src/types/config.js";

describe("wallet service", () => {
  test("getWalletAddress returns address from config", () => {
    const config: Config = {
      network: "mainnet",
      wallet: {
        mnemonic_encrypted: "[encrypted]",
        address: "UQ_test_address",
        version: "v5r1",
      },
      preferences: {
        default_slippage: 0.01,
        default_dex: "stonfi",
        currency: "usd",
      },
    };
    const address = getWalletAddress(config);
    expect(address).toBe("UQ_test_address");
  });

  test("getWalletAddress throws when wallet not configured", () => {
    const config: Config = {
      network: "mainnet",
      preferences: {
        default_slippage: 0.01,
        default_dex: "stonfi",
        currency: "usd",
      },
    };
    expect(() => getWalletAddress(config)).toThrow(ServiceError);
  });

  test("getWalletAddress error has correct code", () => {
    const config: Config = {
      network: "mainnet",
      preferences: {
        default_slippage: 0.01,
        default_dex: "stonfi",
        currency: "usd",
      },
    };
    try {
      getWalletAddress(config);
    } catch (e) {
      expect(e).toBeInstanceOf(ServiceError);
      expect((e as ServiceError).code).toBe("WALLET_NOT_CONFIGURED");
    }
  });
});

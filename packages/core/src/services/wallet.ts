import { mnemonicToPrivateKey } from "@ton/crypto";
import { WalletContractV5R1 } from "@ton/ton";
import { ServiceError } from "../errors.js";
import type { Config } from "../types/config.js";

export interface WalletInfo {
  readonly address: string;
  readonly publicKey: string;
}

/**
 * Derive wallet address from mnemonic words.
 */
export async function createWalletFromMnemonic(mnemonic: string[]): Promise<WalletInfo> {
  try {
    const keyPair = await mnemonicToPrivateKey(mnemonic);
    const wallet = WalletContractV5R1.create({
      publicKey: keyPair.publicKey,
      workchain: 0,
    });
    return {
      address: wallet.address.toString(),
      publicKey: keyPair.publicKey.toString("hex"),
    };
  } catch (err) {
    throw new ServiceError(
      `Failed to derive wallet: ${err instanceof Error ? err.message : String(err)}`,
      "WALLET_DERIVATION_ERROR",
    );
  }
}

/**
 * Get wallet address from config.
 */
export function getWalletAddress(config: Config): string {
  if (!config.wallet) {
    throw new ServiceError(
      "Wallet not configured. Run `tonquant init` first.",
      "WALLET_NOT_CONFIGURED",
    );
  }
  return config.wallet.address;
}

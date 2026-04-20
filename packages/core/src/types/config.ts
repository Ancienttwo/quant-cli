import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

// ============================================================
// Configuration Schema
// ============================================================

export const NetworkSchema = z.enum(["mainnet", "testnet"]);
export type Network = z.infer<typeof NetworkSchema>;

export const WalletConfigSchema = z.object({
  mnemonic_encrypted: z.string(),
  address: z.string(),
  version: z.string().default("v5r1"),
});

export const PreferencesSchema = z.object({
  default_slippage: z.number().default(0.01),
  default_dex: z.string().default("stonfi"),
  currency: z.string().default("usd"),
});

export const ConfigSchema = z.object({
  network: NetworkSchema.default("mainnet"),
  wallet: WalletConfigSchema.optional(),
  preferences: PreferencesSchema.default({}),
});
export type Config = z.infer<typeof ConfigSchema>;

// ============================================================
// Config Paths
// ============================================================

export const CONFIG_DIR = join(homedir(), ".tonquant");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");

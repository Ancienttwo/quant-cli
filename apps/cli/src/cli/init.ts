import {
  type Config,
  createWalletFromMnemonic,
  encrypt,
  getConfigPath,
  getKeyfilePath,
  loadConfig,
  loadOrCreateKey,
  saveConfig,
} from "@tonquant/core";
import type { Command } from "commander";
import type { GlobalCliOptions } from "../types/cli.js";
import { formatInitResult } from "../utils/format.js";
import { CliCommandError, handleCommand } from "../utils/output.js";
import { attachReceipt } from "../utils/receipts.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Configure wallet and network settings")
    .option("--testnet", "Use testnet")
    .option("--mnemonic <words>", "Space-separated mnemonic words")
    .action(async (options: { testnet?: boolean; mnemonic?: string }) => {
      const globalOptions = program.opts<GlobalCliOptions>();
      const json = globalOptions.json ?? false;
      const configPath = globalOptions.config;

      await handleCommand(
        { json },
        async () => {
          if (!options.mnemonic) {
            throw new CliCommandError(
              "Mnemonic required. Use --mnemonic 'word1 word2 ...'",
              "MNEMONIC_REQUIRED",
            );
          }

          const words = options.mnemonic.split(" ");
          if (words.length !== 24) {
            throw new CliCommandError(
              `Expected 24 mnemonic words, got ${words.length}`,
              "INVALID_MNEMONIC",
            );
          }

          const walletInfo = await createWalletFromMnemonic(words);
          const network = options.testnet ? "testnet" : "mainnet";

          const key = await loadOrCreateKey({ configPath });
          const encryptedMnemonic = encrypt(words.join(" "), key);

          const existingConfig = await loadConfig({ configPath });
          const newConfig: Config = {
            ...existingConfig,
            network,
            wallet: {
              mnemonic_encrypted: encryptedMnemonic,
              address: walletInfo.address,
              version: "v5r1",
            },
          };

          await saveConfig(newConfig, { configPath });

          return attachReceipt(
            {
              message: "Wallet configured successfully",
              address: walletInfo.address,
              network,
              configPath: getConfigPath({ configPath }),
            },
            {
              action: "config.write",
              target: "wallet-config",
              writes: [
                { kind: "config", path: getConfigPath({ configPath }) },
                { kind: "file", path: getKeyfilePath({ configPath }) },
              ],
              nextStep: `tonquant balance${configPath ? ` --config ${configPath}` : ""} --json`,
            },
          );
        },
        formatInitResult,
      );
    });
}

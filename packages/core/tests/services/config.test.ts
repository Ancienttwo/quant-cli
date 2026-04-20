import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { getConfigPath, loadConfig, saveConfig } from "../../src/config/index.js";
import { CONFIG_FILE, ConfigSchema } from "../../src/types/config.js";
import { getKeyfilePath, loadOrCreateKey } from "../../src/utils/crypto.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("config", () => {
  test("ConfigSchema parses valid config", () => {
    const config = ConfigSchema.parse({
      network: "mainnet",
      wallet: {
        mnemonic_encrypted: "abc123",
        address: "UQ_addr",
        version: "v5r1",
      },
    });
    expect(config.network).toBe("mainnet");
    expect(config.wallet?.address).toBe("UQ_addr");
    expect(config.preferences.default_slippage).toBe(0.01);
  });

  test("ConfigSchema applies defaults for empty input", () => {
    const config = ConfigSchema.parse({});
    expect(config.network).toBe("mainnet");
    expect(config.wallet).toBeUndefined();
    expect(config.preferences.default_dex).toBe("stonfi");
    expect(config.preferences.currency).toBe("usd");
  });

  test("ConfigSchema rejects invalid network", () => {
    expect(() => ConfigSchema.parse({ network: "devnet" })).toThrow();
  });

  test("getConfigPath returns CONFIG_FILE", () => {
    expect(getConfigPath()).toBe(CONFIG_FILE);
  });

  test("getConfigPath honors an explicit config path", () => {
    const customPath = "/tmp/tonquant-config.json";
    expect(getConfigPath({ configPath: customPath })).toBe(customPath);
  });

  test("loadConfig returns defaults when no file exists", async () => {
    // loadConfig returns defaults if CONFIG_FILE doesn't exist
    // This test may read the real config if it exists on the machine
    const config = await loadConfig();
    expect(config.network).toBeDefined();
    expect(config.preferences).toBeDefined();
  });

  test("saveConfig/loadConfig round-trip honors an explicit path and key placement", async () => {
    const root = mkdtempSync(join(tmpdir(), "tonquant-config-test-"));
    tempDirs.push(root);
    const configPath = join(root, "agent", "wallet.json");
    const config = ConfigSchema.parse({
      network: "testnet",
      wallet: {
        mnemonic_encrypted: "ciphertext",
        address: "UQ_custom",
        version: "v5r1",
      },
    });

    await saveConfig(config, { configPath });
    const loaded = await loadConfig({ configPath });

    expect(loaded).toEqual(config);
    expect(statSync(configPath).mode & 0o777).toBe(0o600);

    const key = await loadOrCreateKey({ configPath });
    const repeated = await loadOrCreateKey({ configPath });
    const keyfilePath = getKeyfilePath({ configPath });

    expect(key.equals(repeated)).toBe(true);
    expect(existsSync(keyfilePath)).toBe(true);
    expect(keyfilePath).toBe(join(dirname(configPath), ".keyfile"));
    expect(statSync(keyfilePath).mode & 0o777).toBe(0o600);
  });
});

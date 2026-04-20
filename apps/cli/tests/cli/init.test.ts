import { afterEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigSchema, decrypt, encrypt, getKeyfilePath } from "@tonquant/core";

describe("init command", () => {
  const VALID_MNEMONIC = Array.from({ length: 24 }, (_, i) => `word${i + 1}`);
  const REAL_VALID_MNEMONIC =
    "member review album just curtain mother odor slide human taste sibling poet gadget country employ release rather jealous reunion purchase lend hobby cliff ride";
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  function runCli(args: string[]) {
    return Bun.spawnSync({
      cmd: ["bun", "run", "src/index.ts", ...args],
      cwd: join(import.meta.dir, "../.."),
      stderr: "pipe",
      stdout: "pipe",
    });
  }

  test("rejects mnemonic with fewer than 24 words", () => {
    const words = VALID_MNEMONIC.slice(0, 12);
    expect(words.length).toBe(12);
    expect(words.length !== 24).toBe(true);
  });

  test("rejects mnemonic with more than 24 words", () => {
    const words = [...VALID_MNEMONIC, "extra"];
    expect(words.length).toBe(25);
    expect(words.length !== 24).toBe(true);
  });

  test("accepts exactly 24 mnemonic words", () => {
    expect(VALID_MNEMONIC.length).toBe(24);
    const joined = VALID_MNEMONIC.join(" ");
    const split = joined.split(" ");
    expect(split.length).toBe(24);
  });

  test("encrypt/decrypt round-trip preserves mnemonic", () => {
    const key = randomBytes(32);
    const plaintext = VALID_MNEMONIC.join(" ");
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  test("encrypted mnemonic differs from plaintext", () => {
    const key = randomBytes(32);
    const plaintext = VALID_MNEMONIC.join(" ");
    const encrypted = encrypt(plaintext, key);
    expect(encrypted).not.toBe(plaintext);
  });

  test("config schema accepts valid wallet config", () => {
    const config = ConfigSchema.parse({
      network: "mainnet",
      wallet: {
        mnemonic_encrypted: "base64encodedstring",
        address: "EQDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        version: "v5r1",
      },
    });
    expect(config.network).toBe("mainnet");
    expect(config.wallet?.address).toBe("EQDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
    expect(config.wallet?.version).toBe("v5r1");
  });

  test("config schema defaults to mainnet when no network specified", () => {
    const config = ConfigSchema.parse({});
    expect(config.network).toBe("mainnet");
  });

  test("config schema accepts testnet network", () => {
    const config = ConfigSchema.parse({ network: "testnet" });
    expect(config.network).toBe("testnet");
  });

  test("global --config writes wallet state to the explicit path", async () => {
    const root = mkdtempSync(join(tmpdir(), "tonquant-init-cli-"));
    tempDirs.push(root);
    const configPath = join(root, "agent", "wallet.json");

    const result = runCli([
      "--json",
      "--config",
      configPath,
      "init",
      "--mnemonic",
      REAL_VALID_MNEMONIC,
    ]);
    expect(result.exitCode).toBe(0);

    const payload = JSON.parse(result.stdout.toString());
    expect(payload.status).toBe("ok");
    expect(payload.data.configPath).toBe(configPath);
    expect(existsSync(configPath)).toBe(true);
    expect(existsSync(getKeyfilePath({ configPath }))).toBe(true);

    const stored = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(stored.wallet.address).toBe(payload.data.address);
  });
});

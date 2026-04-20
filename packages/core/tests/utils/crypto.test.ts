import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt } from "../../src/utils/crypto.js";

describe("crypto", () => {
  const key = randomBytes(32);

  test("encrypt/decrypt roundtrip preserves plaintext", () => {
    const plaintext =
      "abandon ability able about above absent absorb abstract absurd abuse access accident";
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  test("encrypted output differs from plaintext", () => {
    const plaintext = "test mnemonic words";
    const encrypted = encrypt(plaintext, key);
    expect(encrypted).not.toBe(plaintext);
  });

  test("encrypted output is base64", () => {
    const plaintext = "test data";
    const encrypted = encrypt(plaintext, key);
    expect(() => Buffer.from(encrypted, "base64")).not.toThrow();
    expect(Buffer.from(encrypted, "base64").length).toBeGreaterThan(0);
  });

  test("decrypt fails with wrong key", () => {
    const plaintext = "secret data";
    const encrypted = encrypt(plaintext, key);
    const wrongKey = randomBytes(32);
    expect(() => decrypt(encrypted, wrongKey)).toThrow();
  });

  test("each encryption produces unique output (random IV)", () => {
    const plaintext = "same input";
    const enc1 = encrypt(plaintext, key);
    const enc2 = encrypt(plaintext, key);
    expect(enc1).not.toBe(enc2);
  });
});

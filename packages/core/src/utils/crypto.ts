import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type ConfigFileOptions, getConfigPath } from "../config/index.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function getKeyfilePath(options: ConfigFileOptions = {}): string {
  return join(dirname(getConfigPath(options)), ".keyfile");
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns base64-encoded string: iv + authTag + ciphertext.
 */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/**
 * Decrypt base64-encoded ciphertext using AES-256-GCM.
 */
export function decrypt(ciphertext: string, key: Buffer): string {
  const data = Buffer.from(ciphertext, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf-8");
}

/**
 * Load or generate encryption key.
 * Key is stored at ~/.tonquant/.keyfile with 0o600 permissions.
 */
export async function loadOrCreateKey(options: ConfigFileOptions = {}): Promise<Buffer> {
  const keyfilePath = getKeyfilePath(options);
  if (existsSync(keyfilePath)) {
    const hex = await readFile(keyfilePath, "utf-8");
    return Buffer.from(hex.trim(), "hex");
  }

  const keyDir = dirname(keyfilePath);
  if (!existsSync(keyDir)) {
    await mkdir(keyDir, { recursive: true, mode: 0o700 });
  }

  const key = randomBytes(32);
  await writeFile(keyfilePath, key.toString("hex"), { encoding: "utf-8" });
  await chmod(keyfilePath, 0o600);
  return key;
}

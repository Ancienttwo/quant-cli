import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { keyPairFromSeed, sha256_sync, sign } from "@ton/crypto";
import { WalletContractV5R1 } from "@ton/ton";
import {
  buildPreparedPlatformAction,
  buildPublishManifest,
  buildSigningSession,
  hashManifest,
  normalizeTonAddress,
  verifyTonConnectIntentSignature,
  verifyWalletPublicKeyMatchesAddress,
} from "../../src/services/platform-publish.js";
import type { FactorRegistryEntry } from "../../src/types/factor-registry.js";
import { makeFactor, makeFactorEntry } from "../helpers/factor-fixtures.js";

const factorEntry: FactorRegistryEntry = makeFactorEntry(
  "ton_momentum_1d",
  {
    version: "1.2.0",
    updatedAt: "2026-04-09T00:00:00.000Z",
    definition: {
      ...makeFactor("ton_momentum_1d").definition,
      universe: {
        ...makeFactor("ton_momentum_1d").definition.universe,
        assets: ["TON"],
      },
      assets: ["TON"],
      signalFormula: "return_20d",
    },
  },
  {
    parameterValues: {
      window: 14,
    },
    universeRules: [],
    formula: "close / sma(close, 14)",
  },
);

function tonConnectTextMessage(params: {
  address: string;
  domain: string;
  timestamp: number;
  text: string;
}): Buffer {
  const parsed = normalizeTonAddress(params.address);
  const wallet = parsed.split(":");
  const workchain = Buffer.alloc(4);
  workchain.writeInt32BE(Number(wallet[0]), 0);
  const hash = Buffer.from(wallet[1] ?? "", "hex");
  const domain = Buffer.from(params.domain, "utf-8");
  const domainLength = Buffer.alloc(4);
  domainLength.writeUInt32BE(domain.length, 0);
  const timestamp = Buffer.alloc(8);
  timestamp.writeBigUInt64BE(BigInt(params.timestamp), 0);
  const payload = Buffer.from(params.text, "utf-8");
  const payloadLength = Buffer.alloc(4);
  payloadLength.writeUInt32BE(payload.length, 0);

  return Buffer.concat([
    Buffer.from([0xff, 0xff]),
    Buffer.from("ton-connect/sign-data/", "utf-8"),
    workchain,
    hash,
    domainLength,
    domain,
    timestamp,
    Buffer.from("txt", "utf-8"),
    payloadLength,
    payload,
  ]);
}

describe("platform publish service", () => {
  test("buildPublishManifest is deterministic for the same registry entry", () => {
    const first = buildPublishManifest(factorEntry);
    const second = buildPublishManifest(factorEntry);

    expect(first).toEqual(second);
    expect(hashManifest(first)).toBe(hashManifest(second));
  });

  test("normalizeTonAddress converts friendly TON addresses to raw format", () => {
    const raw = WalletContractV5R1.create({
      workchain: 0,
      publicKey: Buffer.alloc(32, 1),
    }).address.toRawString();

    const normalized = normalizeTonAddress(
      WalletContractV5R1.create({
        workchain: 0,
        publicKey: Buffer.alloc(32, 1),
      }).address.toString(),
    );

    expect(normalized).toBe(raw);
  });

  test("verifyWalletPublicKeyMatchesAddress accepts supported wallet addresses", () => {
    const publicKey = Buffer.alloc(32, 9);
    const address = WalletContractV5R1.create({
      workchain: 0,
      publicKey,
    }).address.toRawString();

    expect(
      verifyWalletPublicKeyMatchesAddress({
        publicKeyHex: publicKey.toString("hex"),
        address,
        network: "mainnet",
      }),
    ).toBe(true);
  });

  test("verifyTonConnectIntentSignature accepts a valid signed text intent", () => {
    const keyPair = keyPairFromSeed(Buffer.alloc(32, 5));
    const publicKey = keyPair.publicKey;
    const wallet = WalletContractV5R1.create({
      workchain: 0,
      publicKey,
    });
    const manifest = buildPublishManifest(factorEntry);
    const prepared = buildPreparedPlatformAction({
      action: "publish_factor",
      factorSlug: manifest.factorSlug,
      factorVersion: manifest.factorVersion,
      publisherAddress: wallet.address.toRawString(),
      payoutAddress: wallet.address.toRawString(),
      network: "mainnet",
      audience: "https://publish.tonquant.test",
      manifest,
    });
    const session = buildSigningSession({
      prepared,
      nonce: "nonce-123",
      sessionId: "sess_123",
      issuedAt: "2026-04-09T10:00:00.000Z",
      expiresAt: "2026-04-09T10:10:00.000Z",
      signUrl: "https://publish.tonquant.test/sign?session=sess_123",
    });

    const timestamp = Math.floor(new Date("2026-04-09T10:05:00.000Z").getTime() / 1000);
    const message = tonConnectTextMessage({
      address: wallet.address.toRawString(),
      domain: "publish.tonquant.test",
      timestamp,
      text: session.intentText,
    });
    const signature = sign(sha256_sync(message), keyPair.secretKey);

    expect(() =>
      verifyTonConnectIntentSignature({
        intent: session.intent,
        signedResult: {
          signature: signature.toString("base64"),
          address: wallet.address.toRawString(),
          timestamp,
          domain: "publish.tonquant.test",
          payload: {
            type: "text",
            text: session.intentText,
            network: "-239",
            from: wallet.address.toRawString(),
          },
        },
        publicKeyHex: publicKey.toString("hex"),
        expectedText: session.intentText,
      }),
    ).not.toThrow();
  });

  test("verifyTonConnectIntentSignature rejects mismatched signed domain", () => {
    const keyPair = keyPairFromSeed(Buffer.alloc(32, 6));
    const publicKey = keyPair.publicKey;
    const wallet = WalletContractV5R1.create({
      workchain: 0,
      publicKey,
    });
    const manifest = buildPublishManifest(factorEntry);
    const prepared = buildPreparedPlatformAction({
      action: "publish_factor",
      factorSlug: manifest.factorSlug,
      factorVersion: manifest.factorVersion,
      publisherAddress: wallet.address.toRawString(),
      payoutAddress: wallet.address.toRawString(),
      network: "mainnet",
      audience: "https://publish.tonquant.test",
      manifest,
    });
    const session = buildSigningSession({
      prepared,
      nonce: "nonce-456",
      sessionId: "sess_456",
      issuedAt: "2026-04-09T10:00:00.000Z",
      expiresAt: "2026-04-09T10:10:00.000Z",
      signUrl: "https://publish.tonquant.test/sign?session=sess_456",
    });
    const timestamp = Math.floor(new Date("2026-04-09T10:05:00.000Z").getTime() / 1000);
    const message = tonConnectTextMessage({
      address: wallet.address.toRawString(),
      domain: "evil.example",
      timestamp,
      text: session.intentText,
    });
    const signature = sign(sha256_sync(message), keyPair.secretKey);

    expect(() =>
      verifyTonConnectIntentSignature({
        intent: session.intent,
        signedResult: {
          signature: signature.toString("base64"),
          address: wallet.address.toRawString(),
          timestamp,
          domain: "evil.example",
          payload: {
            type: "text",
            text: session.intentText,
            network: "-239",
            from: wallet.address.toRawString(),
          },
        },
        publicKeyHex: publicKey.toString("hex"),
        expectedText: session.intentText,
      }),
    ).toThrow("audience");
  });
});

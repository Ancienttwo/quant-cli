import { Buffer } from "node:buffer";
import { createHash, randomBytes } from "node:crypto";
import { Address } from "@ton/core";
import { sha256_sync, signVerify } from "@ton/crypto";
import {
  WalletContractV3R1,
  WalletContractV3R2,
  WalletContractV4,
  WalletContractV5R1,
} from "@ton/ton";
import { ServiceError } from "../errors.js";
import type { FactorRegistryEntry } from "../types/factor-registry.js";
import {
  type ArtifactBundle,
  type FactorCommercialTerms,
  type PlatformAction,
  type PreparedPlatformAction,
  PreparedPlatformActionSchema,
  type PublishIntent,
  PublishIntentSchema,
  type PublishManifest,
  PublishManifestSchema,
  type RawTonAddress,
  RawTonAddressSchema,
  type SigningSession,
  SigningSessionSchema,
  type TonConnectSignDataResult,
  TonConnectSignDataResultSchema,
  type TonNetwork,
} from "../types/platform-publish.js";

const TON_CONNECT_PREFIX = "ton-connect/sign-data/";

export class PlatformPublishError extends ServiceError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "PlatformPublishError";
  }
}

export function normalizeTonAddress(address: string): RawTonAddress {
  try {
    return RawTonAddressSchema.parse(Address.parse(address).toRawString());
  } catch {
    throw new PlatformPublishError(`Invalid TON address: ${address}`, "PLATFORM_INVALID_ADDRESS");
  }
}

function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, canonicalizeValue(entryValue)]),
    );
  }
  return value;
}

export function stringifyCanonicalJson(value: unknown, pretty = false): string {
  return JSON.stringify(canonicalizeValue(value), null, pretty ? 2 : undefined);
}

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildPublishManifest(
  entry: FactorRegistryEntry,
  options: {
    commercial?: FactorCommercialTerms;
    artifact?: ArtifactBundle;
  } = {},
): PublishManifest {
  if (entry.public.listingType !== "factor") {
    throw new PlatformPublishError(
      "Legacy signal entries cannot be published to the factor marketplace. Re-evaluate them under the factor contract first.",
      "PLATFORM_FACTOR_EVALUATION_REQUIRED",
    );
  }
  const manifest = {
    kind: "tonquant.factor.publish-manifest" as const,
    manifestVersion: "1.0.0" as const,
    factorSlug: entry.public.id,
    factorVersion: entry.public.version,
    factor: entry,
    commercial: options.commercial,
    artifact: options.artifact,
    preparedAt: entry.public.updatedAt,
  };
  return PublishManifestSchema.parse(manifest);
}

export function buildPublishIntent(params: {
  action: PlatformAction;
  factorSlug: string;
  factorVersion?: string;
  publisherAddress: string;
  payoutAddress: string;
  manifestSha256?: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  audience: string;
  network: TonNetwork;
}): PublishIntent {
  return PublishIntentSchema.parse({
    kind: "tonquant.factor.publish-intent",
    action: params.action,
    factorSlug: params.factorSlug,
    factorVersion: params.factorVersion,
    publisherAddress: normalizeTonAddress(params.publisherAddress),
    payoutAddress: normalizeTonAddress(params.payoutAddress),
    manifestSha256: params.manifestSha256,
    nonce: params.nonce,
    issuedAt: params.issuedAt,
    expiresAt: params.expiresAt,
    audience: params.audience,
    chain: "ton",
    network: params.network,
  });
}

export function buildPreparedPlatformAction(
  params: PreparedPlatformAction,
): PreparedPlatformAction {
  return PreparedPlatformActionSchema.parse({
    ...params,
    publisherAddress: normalizeTonAddress(params.publisherAddress),
    payoutAddress: normalizeTonAddress(params.payoutAddress),
  });
}

export function buildIntentText(intent: PublishIntent): string {
  return stringifyCanonicalJson(intent, true);
}

export function hashManifest(manifest: PublishManifest): string {
  return sha256Hex(stringifyCanonicalJson(manifest));
}

export function createNonce(): string {
  return randomBytes(16).toString("base64url");
}

export function createSessionId(): string {
  return `sess_${randomBytes(12).toString("hex")}`;
}

export function createPublicationId(): string {
  return `pub_${randomBytes(12).toString("hex")}`;
}

export function createSettlementBatchId(): string {
  return `set_${randomBytes(12).toString("hex")}`;
}

function networkToTonConnectValue(network: TonNetwork): "-239" | "-3" {
  return network === "mainnet" ? "-239" : "-3";
}

function buildTonConnectAddressBytes(address: RawTonAddress): Buffer {
  const parsed = Address.parse(address);
  const workchain = Buffer.alloc(4);
  workchain.writeInt32BE(parsed.workChain, 0);
  const hash = Buffer.from(parsed.hash);
  return Buffer.concat([workchain, hash]);
}

function buildTonConnectTextMessage(result: TonConnectSignDataResult): Buffer {
  const domainBytes = Buffer.from(result.domain, "utf-8");
  const domainLength = Buffer.alloc(4);
  domainLength.writeUInt32BE(domainBytes.length, 0);

  const timestampBytes = Buffer.alloc(8);
  timestampBytes.writeBigUInt64BE(BigInt(result.timestamp), 0);

  const payloadPrefix = Buffer.from("txt", "utf-8");
  const payloadData = Buffer.from(result.payload.text, "utf-8");
  const payloadLength = Buffer.alloc(4);
  payloadLength.writeUInt32BE(payloadData.length, 0);

  return Buffer.concat([
    Buffer.from([0xff, 0xff]),
    Buffer.from(TON_CONNECT_PREFIX, "utf-8"),
    buildTonConnectAddressBytes(result.address),
    domainLength,
    domainBytes,
    timestampBytes,
    payloadPrefix,
    payloadLength,
    payloadData,
  ]);
}

function candidateWalletAddresses(
  publicKey: Buffer,
  address: RawTonAddress,
  network: TonNetwork,
): RawTonAddress[] {
  const parsed = Address.parse(address);
  const workchain = parsed.workChain;
  const candidates = new Set<string>();

  candidates.add(WalletContractV3R1.create({ workchain, publicKey }).address.toRawString());
  candidates.add(WalletContractV3R2.create({ workchain, publicKey }).address.toRawString());
  candidates.add(WalletContractV4.create({ workchain, publicKey }).address.toRawString());
  candidates.add(WalletContractV5R1.create({ workchain, publicKey }).address.toRawString());

  if (network === "testnet") {
    candidates.add(
      WalletContractV5R1.create({
        workchain,
        publicKey,
        walletId: { networkGlobalId: -3 },
      }).address.toRawString(),
    );
  }

  return [...candidates].map((entry) => normalizeTonAddress(entry));
}

export function verifyWalletPublicKeyMatchesAddress(params: {
  publicKeyHex: string;
  address: string;
  network: TonNetwork;
}): boolean {
  try {
    const publicKey = Buffer.from(params.publicKeyHex, "hex");
    const normalizedAddress = normalizeTonAddress(params.address);
    return candidateWalletAddresses(publicKey, normalizedAddress, params.network).includes(
      normalizedAddress,
    );
  } catch {
    return false;
  }
}

export function verifyTonConnectIntentSignature(params: {
  intent: PublishIntent;
  signedResult: TonConnectSignDataResult;
  publicKeyHex: string;
  expectedText: string;
}): void {
  const intent = PublishIntentSchema.parse(params.intent);
  const signedResult = TonConnectSignDataResultSchema.parse(params.signedResult);

  const expectedAddress = normalizeTonAddress(intent.publisherAddress);
  const signedAddress = normalizeTonAddress(signedResult.address);
  if (expectedAddress !== signedAddress) {
    throw new PlatformPublishError(
      "Signed address does not match the intent owner.",
      "PLATFORM_SIGNER_MISMATCH",
    );
  }

  if (signedResult.payload.text !== params.expectedText) {
    throw new PlatformPublishError(
      "Signed payload text does not match the prepared intent.",
      "PLATFORM_SIGNED_TEXT_MISMATCH",
    );
  }

  if (signedResult.payload.from !== expectedAddress) {
    throw new PlatformPublishError(
      "Signed payload owner does not match the prepared intent.",
      "PLATFORM_SIGNED_FROM_MISMATCH",
    );
  }

  const expectedNetwork = networkToTonConnectValue(intent.network);
  if (signedResult.payload.network !== expectedNetwork) {
    throw new PlatformPublishError(
      "Signed payload network does not match the prepared intent.",
      "PLATFORM_SIGNED_NETWORK_MISMATCH",
    );
  }

  const expectedDomain = new URL(intent.audience).host;
  if (signedResult.domain !== expectedDomain) {
    throw new PlatformPublishError(
      "Signed payload domain does not match the audience.",
      "PLATFORM_SIGNED_DOMAIN_MISMATCH",
    );
  }

  const signedAt = new Date(signedResult.timestamp * 1000);
  const issuedAt = new Date(intent.issuedAt);
  const expiresAt = new Date(intent.expiresAt);
  if (signedAt < issuedAt || signedAt > expiresAt) {
    throw new PlatformPublishError(
      "Signed payload timestamp is outside the allowed intent window.",
      "PLATFORM_SIGNED_TIMESTAMP_INVALID",
    );
  }

  if (
    !verifyWalletPublicKeyMatchesAddress({
      publicKeyHex: params.publicKeyHex,
      address: expectedAddress,
      network: intent.network,
    })
  ) {
    throw new PlatformPublishError(
      "Provided public key does not match a supported standard wallet address for the signer.",
      "PLATFORM_PUBLIC_KEY_ADDRESS_MISMATCH",
    );
  }

  const publicKey = Buffer.from(params.publicKeyHex, "hex");
  const signature = Buffer.from(signedResult.signature, "base64");
  const message = buildTonConnectTextMessage(signedResult);
  const verified = signVerify(sha256_sync(message), signature, publicKey);

  if (!verified) {
    throw new PlatformPublishError("Signature verification failed.", "PLATFORM_SIGNATURE_INVALID");
  }
}

export function buildSigningSession(params: {
  prepared: PreparedPlatformAction;
  nonce: string;
  sessionId: string;
  issuedAt: string;
  expiresAt: string;
  signUrl: string;
  artifactUploadUrl?: string;
}): SigningSession {
  const manifestSha256 = params.prepared.manifest
    ? hashManifest(params.prepared.manifest)
    : undefined;
  const intent = buildPublishIntent({
    action: params.prepared.action,
    factorSlug: params.prepared.factorSlug,
    factorVersion:
      params.prepared.action === "set_payout_address"
        ? undefined
        : (params.prepared.factorVersion ?? params.prepared.manifest?.factorVersion),
    publisherAddress: params.prepared.publisherAddress,
    payoutAddress: params.prepared.payoutAddress,
    manifestSha256,
    nonce: params.nonce,
    issuedAt: params.issuedAt,
    expiresAt: params.expiresAt,
    audience: params.prepared.audience,
    network: params.prepared.network,
  });

  return SigningSessionSchema.parse({
    sessionId: params.sessionId,
    action: params.prepared.action,
    factorSlug: params.prepared.factorSlug,
    factorVersion: intent.factorVersion,
    publisherAddress: intent.publisherAddress,
    payoutAddress: intent.payoutAddress,
    network: intent.network,
    audience: intent.audience,
    nonce: params.nonce,
    intent,
    intentText: buildIntentText(intent),
    manifest: params.prepared.manifest,
    manifestSha256,
    status: "pending",
    signUrl: params.signUrl,
    artifactUploadUrl: params.artifactUploadUrl,
    expiresAt: params.expiresAt,
    createdAt: params.issuedAt,
  });
}

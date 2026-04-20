import { readFileSync } from "node:fs";
import {
  type ArtifactDownloadGrant,
  ArtifactDownloadGrantSchema,
  type AuthorProfile,
  AuthorProfileSchema,
  type PreparedPlatformAction,
  PreparedPlatformActionSchema,
  type PublicationStatusResponse,
  PublicationStatusResponseSchema,
  type PullSession,
  PullSessionSchema,
  SigningSessionSchema,
} from "@tonquant/core";
import { z } from "zod";
import { CliCommandError } from "../utils/output.js";

const PlatformEnvelopeSchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({
    status: z.literal("ok"),
    data: schema,
  });

const PlatformErrorEnvelopeSchema = z.object({
  status: z.literal("error"),
  error: z.string(),
  code: z.string(),
});

export async function platformRequest<T extends z.ZodTypeAny>(params: {
  platformUrl: string;
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  schema: T;
}): Promise<z.output<T>> {
  const response = await fetch(`${params.platformUrl.replace(/\/$/u, "")}${params.path}`, {
    method: params.method ?? "GET",
    headers: params.body ? { "content-type": "application/json" } : undefined,
    body: params.body ? JSON.stringify(params.body) : undefined,
  });

  const payload = await response.json();
  if (response.ok) {
    return PlatformEnvelopeSchema(params.schema).parse(payload).data;
  }

  const parsedError = PlatformErrorEnvelopeSchema.safeParse(payload);
  if (parsedError.success) {
    throw new CliCommandError(parsedError.data.error, parsedError.data.code);
  }

  throw new CliCommandError("Platform API returned an invalid response.", "PLATFORM_HTTP_INVALID");
}

export function resolveAudience(explicit?: string): string {
  return (
    explicit ??
    process.env.TONQUANT_PLATFORM_AUDIENCE ??
    process.env.TONQUANT_PLATFORM_SIGNER_ORIGIN ??
    "http://localhost:5173"
  );
}

export function resolvePlatformUrl(explicit?: string): string {
  return explicit ?? process.env.TONQUANT_PLATFORM_URL ?? "http://localhost:3001";
}

export function resolveNetwork(testnetEnabled: boolean): "mainnet" | "testnet" {
  return testnetEnabled ? "testnet" : "mainnet";
}

export function loadPreparedAction(path: string): PreparedPlatformAction {
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  const prepared = PreparedPlatformActionSchema.safeParse(raw.prepared ?? raw);
  if (!prepared.success) {
    throw new CliCommandError("Prepared publish file is invalid.", "PLATFORM_PREPARED_INVALID");
  }
  return prepared.data;
}

export async function createSigningSession(params: { platformUrl: string; body: unknown }) {
  return platformRequest({
    platformUrl: params.platformUrl,
    path: "/v1/wallet/nonce",
    method: "POST",
    body: params.body,
    schema: SigningSessionSchema,
  });
}

export async function uploadSigningArtifact(params: {
  uploadUrl: string;
  artifactPath: string;
  bundleFileName: string;
  bundleSha256: string;
  sizeBytes: number;
}): Promise<void> {
  const response = await fetch(params.uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": "application/octet-stream",
      "x-tonquant-bundle-file-name": params.bundleFileName,
      "x-tonquant-bundle-sha256": params.bundleSha256,
      "x-tonquant-bundle-size": String(params.sizeBytes),
    },
    body: readFileSync(params.artifactPath),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const parsedError = PlatformErrorEnvelopeSchema.safeParse(payload);
    if (parsedError.success) {
      throw new CliCommandError(parsedError.data.error, parsedError.data.code);
    }
    throw new CliCommandError(
      "Platform artifact upload failed.",
      "PLATFORM_ARTIFACT_UPLOAD_FAILED",
    );
  }
}

export async function fetchPublicationStatus(params: {
  platformUrl: string;
  publicationId: string;
}): Promise<PublicationStatusResponse> {
  return platformRequest({
    platformUrl: params.platformUrl,
    path: `/v1/publications/${params.publicationId}`,
    schema: PublicationStatusResponseSchema,
  });
}

export async function fetchAuthorProfile(params: {
  platformUrl: string;
  wallet: string;
}): Promise<AuthorProfile> {
  return platformRequest({
    platformUrl: params.platformUrl,
    path: `/v1/authors/${encodeURIComponent(params.wallet)}`,
    schema: AuthorProfileSchema,
  });
}

export async function createPullSession(params: {
  platformUrl: string;
  factorSlug: string;
  callbackUrl: string;
}): Promise<PullSession> {
  return platformRequest({
    platformUrl: params.platformUrl,
    path: "/v1/pull-sessions",
    method: "POST",
    body: {
      factorSlug: params.factorSlug,
      callbackUrl: params.callbackUrl,
    },
    schema: PullSessionSchema,
  });
}

export async function exchangePullSession(params: {
  platformUrl: string;
  pullSessionId: string;
  code: string;
}): Promise<ArtifactDownloadGrant> {
  return platformRequest({
    platformUrl: params.platformUrl,
    path: "/v1/pull-sessions/exchange",
    method: "POST",
    body: {
      pullSessionId: params.pullSessionId,
      code: params.code,
    },
    schema: ArtifactDownloadGrantSchema,
  });
}

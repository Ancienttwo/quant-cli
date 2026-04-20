import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import {
  buildPreparedPlatformAction,
  buildPublishManifest,
  FactorEvaluationArtifactSchema,
  getFactorDetail,
  normalizeStoredFactorMetaPublic,
  sha256Hex,
  validateFactorMarketplaceContract,
  validateFactorMetricsCompleteness,
} from "@tonquant/core";
import type { Command } from "commander";
import {
  createSigningSession,
  fetchPublicationStatus,
  loadPreparedAction,
  resolveAudience,
  resolveNetwork,
  resolvePlatformUrl,
  uploadSigningArtifact,
} from "../automation/platform-client.js";
import {
  formatPlatformPrepared,
  formatPlatformPublicationStatus,
  formatPlatformSigningSession,
} from "../utils/format-platform.js";
import { CliCommandError, handleCommand } from "../utils/output.js";
import { attachReceipt } from "../utils/receipts.js";

interface PublishPrepareOptions {
  publisherAddress: string;
  payoutAddress?: string;
  action?: "publish_factor" | "update_factor";
  audience?: string;
  evaluationFile: string;
  artifactBundle: string;
  durationDays: number;
  priceTon: string;
  tierLabel?: string;
  output?: string;
}

interface PublishSubmitOptions {
  platformUrl?: string;
  preparedFile: string;
}

interface PublishStatusOptions {
  platformUrl?: string;
}

interface PayoutSetOptions {
  platformUrl?: string;
  publisherAddress: string;
  payoutAddress: string;
  audience?: string;
}

const DEFAULT_PLATFORM_FEE_BPS = 1500;

function deprecationWarning(alias: string, replacement: string): string {
  return `\`${alias}\` is deprecated and hidden from help. Use \`${replacement}\` during the compatibility window.`;
}

function assertCompleteFactorQuality(
  target: string,
  factorQuality: Parameters<typeof validateFactorMetricsCompleteness>[0],
): void {
  const missingFields = validateFactorMetricsCompleteness(factorQuality);
  if (missingFields.length === 0) {
    return;
  }

  throw new CliCommandError(
    `${target} is missing required factor-quality fields: ${missingFields.join(", ")}.`,
    "METRIC_INCOMPLETE",
  );
}

function assertMarketplaceReady(params: {
  target: string;
  factorQuality: Parameters<typeof validateFactorMetricsCompleteness>[0];
  implementationProfile?: { capacityValue: number };
  provenance?: Parameters<typeof validateFactorMarketplaceContract>[0]["provenance"];
}): string[] {
  assertCompleteFactorQuality(params.target, params.factorQuality);
  const validation = validateFactorMarketplaceContract({
    factorQuality: params.factorQuality,
    implementationProfile: params.implementationProfile,
    provenance: params.provenance,
  });

  if (validation.hardFailures.length > 0) {
    throw new CliCommandError(
      validation.hardFailures.map((issue) => issue.message).join(" "),
      "MARKETPLACE_HARD_GATE_FAILED",
    );
  }

  return validation.softWarnings.map((issue) => issue.message);
}

function parsePositiveInteger(raw: string, fieldName: string): number {
  if (!/^\d+$/u.test(raw.trim())) {
    throw new CliCommandError(`${fieldName} must be a positive integer.`, "CLI_ARGUMENT_INVALID");
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new CliCommandError(`${fieldName} must be a positive integer.`, "CLI_ARGUMENT_INVALID");
  }
  return parsed;
}

function parseTonAmount(raw: string): string {
  if (!/^(0|[1-9]\d*)(\.\d{1,9})?$/u.test(raw.trim())) {
    throw new CliCommandError(
      "--price-ton must be a positive TON amount with up to 9 decimal places.",
      "CLI_ARGUMENT_INVALID",
    );
  }
  return raw.trim();
}

export function registerFactorPlatformCommands(factor: Command): void {
  factor
    .command("publish-prepare <factorId>")
    .description("Prepare a local factor for platform publication")
    .requiredOption(
      "--publisher-address <address>",
      "Owning TON wallet address in raw or friendly format",
    )
    .option(
      "--payout-address <address>",
      "Future payout TON wallet address; defaults to publisher address",
    )
    .option("--action <action>", "publish_factor or update_factor", "publish_factor")
    .option("--audience <url>", "Signer page origin; defaults to env or http://localhost:5173")
    .requiredOption(
      "--evaluation-file <path>",
      "factor-evaluation.json used for publish validation",
    )
    .requiredOption(
      "--artifact-bundle <path>",
      "Artifact bundle to stage for paid pull delivery after approval",
    )
    .requiredOption("--price-ton <amount>", "Paid pull price in TON", parseTonAmount)
    .requiredOption("--duration-days <days>", "Subscription duration in calendar days", (value) =>
      parsePositiveInteger(value, "--duration-days"),
    )
    .option("--tier-label <label>", "Commercial tier label", "standard")
    .option("--output <path>", "Write the prepared payload to a file")
    .action(async (factorId: string, opts: PublishPrepareOptions) => {
      const json = factor.parent?.opts().json ?? false;
      const testnet = factor.parent?.opts().testnet ?? false;
      await handleCommand(
        { json },
        async () => {
          const evaluation = FactorEvaluationArtifactSchema.parse(
            JSON.parse(readFileSync(opts.evaluationFile, "utf-8")),
          );
          const evaluationWarnings = assertMarketplaceReady({
            target: "Evaluation artifact",
            factorQuality: evaluation.metrics.factorQuality,
            implementationProfile: evaluation.metrics.implementationProfile,
            provenance: evaluation.provenance,
          });
          const detail = getFactorDetail(factorId);
          const detailPublic = normalizeStoredFactorMetaPublic(detail.public);
          if (detailPublic.listingType !== "factor") {
            throw new Error(
              "Legacy signal entries cannot be published to the factor marketplace. Re-run them through tonquant factor evaluate and tonquant factor publish first.",
            );
          }
          const registryWarnings = assertMarketplaceReady({
            target: `Local registry factor '${factorId}'`,
            factorQuality: detailPublic.metrics.factorQuality,
            implementationProfile: detailPublic.metrics.implementationProfile,
            provenance: detailPublic.provenance,
          });
          if (
            JSON.stringify(detailPublic.definition) !== JSON.stringify(evaluation.definition) ||
            JSON.stringify(detailPublic.metrics) !== JSON.stringify(evaluation.metrics) ||
            JSON.stringify(detailPublic.provenance) !== JSON.stringify(evaluation.provenance) ||
            JSON.stringify(detailPublic.referenceBacktest) !==
              JSON.stringify(evaluation.referenceBacktest)
          ) {
            throw new Error(
              "Evaluation artifact does not match the current registry entry. Re-run tonquant factor publish with the same factor-evaluation.json before preparing publication.",
            );
          }
          const artifactBytes = readFileSync(opts.artifactBundle);
          const manifest = buildPublishManifest(
            { ...detail, public: detailPublic },
            {
              commercial: {
                tierLabel: opts.tierLabel ?? "standard",
                durationDays: opts.durationDays,
                priceTon: opts.priceTon,
                platformFeeBps: DEFAULT_PLATFORM_FEE_BPS,
              },
              artifact: {
                bundleFileName: basename(opts.artifactBundle),
                bundleSha256: sha256Hex(artifactBytes),
                sizeBytes: statSync(opts.artifactBundle).size,
                stage: "staged",
              },
            },
          );
          const prepared = buildPreparedPlatformAction({
            action: opts.action ?? "publish_factor",
            factorSlug: manifest.factorSlug,
            factorVersion: manifest.factorVersion,
            publisherAddress: opts.publisherAddress,
            payoutAddress: opts.payoutAddress ?? opts.publisherAddress,
            network: resolveNetwork(testnet),
            audience: resolveAudience(opts.audience),
            manifest,
            artifactBundlePath: opts.artifactBundle,
          });

          if (opts.output) {
            writeFileSync(opts.output, `${JSON.stringify(prepared, null, 2)}\n`, "utf-8");
          }

          return attachReceipt(
            { prepared, outputPath: opts.output },
            {
              action: "platform.publish.prepare",
              target: prepared.factorSlug,
              writes: [
                ...(opts.output ? [{ kind: "file" as const, path: opts.output }] : []),
                { kind: "file" as const, path: opts.evaluationFile },
                { kind: "file" as const, path: opts.artifactBundle },
              ],
              nextStep: `tonquant factor publish-request-signature --prepared-file ${opts.output ?? "<prepared.json>"} --json`,
              warnings: [...evaluationWarnings, ...registryWarnings],
            },
          );
        },
        (result) => formatPlatformPrepared(result),
      );
    });

  factor
    .command("publish-request-signature")
    .description("Create a wallet signing session for a prepared publish action")
    .requiredOption("--prepared-file <path>", "JSON file produced by publish-prepare")
    .option("--platform-url <url>", "Platform API origin; defaults to env or http://localhost:3001")
    .action(async (opts: PublishSubmitOptions) => {
      const json = factor.parent?.opts().json ?? false;
      await handleCommand(
        { json },
        async () => {
          const session = await createSigningSession({
            platformUrl: resolvePlatformUrl(opts.platformUrl),
            body: loadPreparedAction(opts.preparedFile),
          });
          if (session.artifactUploadUrl && session.manifest?.artifact) {
            const prepared = loadPreparedAction(opts.preparedFile);
            if (!prepared.artifactBundlePath) {
              throw new CliCommandError(
                "Prepared publish file is missing artifactBundlePath. Re-run publish-prepare with --artifact-bundle.",
                "PLATFORM_ARTIFACT_PATH_REQUIRED",
              );
            }
            await uploadSigningArtifact({
              uploadUrl: session.artifactUploadUrl,
              artifactPath: prepared.artifactBundlePath,
              bundleFileName: session.manifest.artifact.bundleFileName,
              bundleSha256: session.manifest.artifact.bundleSha256,
              sizeBytes: session.manifest.artifact.sizeBytes,
            });
          }

          return attachReceipt(session, {
            action: "platform.signature.request",
            target: session.factorSlug,
            writes: [
              { kind: "platform-session", path: session.sessionId },
              ...(session.manifest?.artifact
                ? [{ kind: "file" as const, path: session.manifest.artifact.bundleFileName }]
                : []),
            ],
            nextStep: `Open ${session.signUrl} to sign, then run tonquant factor publish-status <publicationId> --json once the signer completes the handoff.`,
          });
        },
        (result) => formatPlatformSigningSession(result),
      );
    });

  factor
    .command("publish-submit", { hidden: true })
    .description("Deprecated alias for publish-request-signature")
    .requiredOption("--prepared-file <path>", "JSON file produced by publish-prepare")
    .option("--platform-url <url>", "Platform API origin; defaults to env or http://localhost:3001")
    .action(async (opts: PublishSubmitOptions) => {
      const json = factor.parent?.opts().json ?? false;
      await handleCommand(
        { json },
        async () => {
          const session = await createSigningSession({
            platformUrl: resolvePlatformUrl(opts.platformUrl),
            body: loadPreparedAction(opts.preparedFile),
          });
          if (session.artifactUploadUrl && session.manifest?.artifact) {
            const prepared = loadPreparedAction(opts.preparedFile);
            if (!prepared.artifactBundlePath) {
              throw new CliCommandError(
                "Prepared publish file is missing artifactBundlePath. Re-run publish-prepare with --artifact-bundle.",
                "PLATFORM_ARTIFACT_PATH_REQUIRED",
              );
            }
            await uploadSigningArtifact({
              uploadUrl: session.artifactUploadUrl,
              artifactPath: prepared.artifactBundlePath,
              bundleFileName: session.manifest.artifact.bundleFileName,
              bundleSha256: session.manifest.artifact.bundleSha256,
              sizeBytes: session.manifest.artifact.sizeBytes,
            });
          }

          return attachReceipt(session, {
            action: "platform.signature.request",
            target: session.factorSlug,
            writes: [{ kind: "platform-session", path: session.sessionId }],
            nextStep: `Open ${session.signUrl} to sign, then run tonquant factor publish-status <publicationId> --json once the signer completes the handoff.`,
            warnings: [
              deprecationWarning("factor publish-submit", "factor publish-request-signature"),
            ],
          });
        },
        (result) => formatPlatformSigningSession(result),
      );
    });

  factor
    .command("publish-status <publicationId>")
    .description("Check the platform review status for a publication")
    .option("--platform-url <url>", "Platform API origin; defaults to env or http://localhost:3001")
    .action(async (publicationId: string, opts: PublishStatusOptions) => {
      const json = factor.parent?.opts().json ?? false;
      await handleCommand(
        { json },
        async () =>
          fetchPublicationStatus({
            platformUrl: resolvePlatformUrl(opts.platformUrl),
            publicationId,
          }),
        formatPlatformPublicationStatus,
      );
    });

  factor
    .command("payout-request-signature <factorSlug>")
    .description("Create a payout-address signing session for a published factor")
    .requiredOption("--publisher-address <address>", "Owning TON wallet address")
    .requiredOption("--payout-address <address>", "New payout TON wallet address")
    .option("--audience <url>", "Signer page origin; defaults to env or http://localhost:5173")
    .option("--platform-url <url>", "Platform API origin; defaults to env or http://localhost:3001")
    .action(async (factorSlug: string, opts: PayoutSetOptions) => {
      const json = factor.parent?.opts().json ?? false;
      const testnet = factor.parent?.opts().testnet ?? false;
      await handleCommand(
        { json },
        async () => {
          const session = await createSigningSession({
            platformUrl: resolvePlatformUrl(opts.platformUrl),
            body: {
              action: "set_payout_address",
              factorSlug,
              publisherAddress: opts.publisherAddress,
              payoutAddress: opts.payoutAddress,
              network: resolveNetwork(testnet),
              audience: resolveAudience(opts.audience),
            },
          });

          return attachReceipt(session, {
            action: "platform.signature.request",
            target: session.factorSlug,
            writes: [{ kind: "platform-session", path: session.sessionId }],
            nextStep: `Open ${session.signUrl} to sign the payout update request.`,
          });
        },
        (result) => formatPlatformSigningSession(result),
      );
    });

  factor
    .command("payout-set <factorSlug>", { hidden: true })
    .description("Deprecated alias for payout-request-signature")
    .requiredOption("--publisher-address <address>", "Owning TON wallet address")
    .requiredOption("--payout-address <address>", "New payout TON wallet address")
    .option("--audience <url>", "Signer page origin; defaults to env or http://localhost:5173")
    .option("--platform-url <url>", "Platform API origin; defaults to env or http://localhost:3001")
    .action(async (factorSlug: string, opts: PayoutSetOptions) => {
      const json = factor.parent?.opts().json ?? false;
      const testnet = factor.parent?.opts().testnet ?? false;
      await handleCommand(
        { json },
        async () => {
          const session = await createSigningSession({
            platformUrl: resolvePlatformUrl(opts.platformUrl),
            body: {
              action: "set_payout_address",
              factorSlug,
              publisherAddress: opts.publisherAddress,
              payoutAddress: opts.payoutAddress,
              network: resolveNetwork(testnet),
              audience: resolveAudience(opts.audience),
            },
          });

          return attachReceipt(session, {
            action: "platform.signature.request",
            target: session.factorSlug,
            writes: [{ kind: "platform-session", path: session.sessionId }],
            nextStep: `Open ${session.signUrl} to sign the payout update request.`,
            warnings: [deprecationWarning("factor payout-set", "factor payout-request-signature")],
          });
        },
        (result) => formatPlatformSigningSession(result),
      );
    });
}

import type {
  PayoutChangeResult,
  PreparedPlatformAction,
  PublicationStatusResponse,
  SigningSession,
} from "@tonquant/core";
import chalk from "chalk";

export function formatPlatformPrepared(result: {
  prepared: PreparedPlatformAction;
  outputPath?: string;
}): string {
  const lines = [
    `${chalk.green("Prepared")} platform action for ${chalk.cyan(result.prepared.factorSlug)}`,
    `Action: ${chalk.yellow(result.prepared.action)}`,
    `Publisher: ${chalk.cyan(result.prepared.publisherAddress)}`,
    `Payout: ${chalk.cyan(result.prepared.payoutAddress)}`,
    `Audience: ${chalk.cyan(result.prepared.audience)}`,
  ];

  if (result.outputPath) {
    lines.push(`Saved: ${chalk.cyan(result.outputPath)}`);
  } else {
    lines.push("");
    lines.push(JSON.stringify(result.prepared, null, 2));
  }

  return lines.join("\n");
}

export function formatPlatformSigningSession(session: SigningSession): string {
  return [
    `${chalk.green("Signature requested")} for ${chalk.cyan(session.factorSlug)}`,
    `Session: ${chalk.cyan(session.sessionId)}`,
    `Action: ${chalk.yellow(session.action)}`,
    `Expires: ${chalk.cyan(session.expiresAt)}`,
    `Sign URL: ${chalk.cyan(session.signUrl)}`,
  ].join("\n");
}

export function formatPlatformPublicationStatus(status: PublicationStatusResponse): string {
  const lines = [
    `${chalk.green("Publication")} ${chalk.cyan(status.publication.publicationId)}`,
    `Factor: ${chalk.cyan(status.publication.factorSlug)}@${chalk.cyan(status.publication.factorVersion)}`,
    `Status: ${chalk.yellow(status.publication.status)}`,
    `Publisher: ${chalk.cyan(status.publication.publisherAddress)}`,
  ];

  if (status.publication.rejectionReason) {
    lines.push(`Rejection: ${chalk.red(status.publication.rejectionReason)}`);
  }

  if (status.activeVersion) {
    lines.push(
      `Active version: ${chalk.cyan(status.activeVersion.factorVersion)} since ${chalk.cyan(status.activeVersion.activatedAt)}`,
    );
  }

  return lines.join("\n");
}

export function formatPlatformPayoutResult(result: PayoutChangeResult): string {
  return [
    `${chalk.green("Payout updated")} for ${chalk.cyan(result.factorSlug)}`,
    `Publisher: ${chalk.cyan(result.publisherAddress)}`,
    `New payout: ${chalk.cyan(result.payoutAddress)}`,
    `Changed at: ${chalk.cyan(result.changedAt)}`,
  ].join("\n");
}

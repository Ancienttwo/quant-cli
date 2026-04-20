import chalk from "chalk";
import type {
  ContextCollectionSummary,
  ContextSnapshotSectionStatus,
  TonQuantContextSnapshot,
} from "../cli/context.js";
import { divider, header } from "./format-helpers.js";

function formatSectionSummary(label: string, section: ContextCollectionSummary): string[] {
  const lines = [`${label}: ${chalk.cyan(String(section.total))}`];
  if (section.recent.length > 0) {
    lines.push(`  Recent: ${section.recent.join(", ")}`);
  }
  if (section.error) {
    lines.push(chalk.yellow(`  Warning: ${section.error}`));
  }
  return lines;
}

function formatStatusLine(status: ContextSnapshotSectionStatus): string {
  return `${chalk.cyan(status.name)}: ${status.status} - ${status.details}`;
}

export function formatContextSnapshot(snapshot: TonQuantContextSnapshot): string {
  const lines = [
    header("TonQuant Context"),
    divider(),
    `  Version: ${chalk.cyan(snapshot.version)}`,
    `  Generated: ${chalk.cyan(snapshot.generatedAt)}`,
    `  Bun: ${chalk.cyan(snapshot.runtime.bun)}`,
    `  CWD: ${chalk.cyan(snapshot.runtime.cwd)}`,
    divider(),
    header("Config"),
    divider(),
    `  Path: ${chalk.cyan(snapshot.config.path)}`,
    `  Exists: ${chalk.cyan(String(snapshot.config.exists))}`,
    `  Custom: ${chalk.cyan(String(snapshot.config.customPath))}`,
    `  Network: ${chalk.cyan(snapshot.config.network ?? "unconfigured")}`,
    `  Wallet: ${chalk.cyan(snapshot.config.walletAddress ?? "unconfigured")}`,
    `  Keyfile: ${chalk.cyan(snapshot.config.keyfilePath)} (${snapshot.config.keyfileExists ? "present" : "missing"})`,
  ];

  if (snapshot.config.error) {
    lines.push(chalk.yellow(`  Warning: ${snapshot.config.error}`));
  }

  lines.push(
    divider(),
    header("Stores"),
    divider(),
    `  Active config dir: ${chalk.cyan(snapshot.stores.activeConfigDir)}`,
    `  Default local root: ${chalk.cyan(snapshot.stores.defaultConfigRoot)}`,
    `  Quant root: ${chalk.cyan(snapshot.stores.quantRoot)}`,
    `  Platform DB: ${chalk.cyan(snapshot.stores.platformDbPath)}`,
    divider(),
    header("State"),
    divider(),
    ...formatSectionSummary("Registry factors", snapshot.registry),
    ...formatSectionSummary("Reports", snapshot.reports),
    ...formatSectionSummary("Automation jobs", snapshot.automation),
    ...formatSectionSummary("Autoresearch tracks", snapshot.autoresearch),
    ...formatSectionSummary("Signing sessions", snapshot.signingSessions),
    ...formatSectionSummary("Publications", snapshot.publications),
    `Artifacts: ${chalk.cyan(String(snapshot.artifacts.total))}`,
  );

  if (snapshot.artifacts.recent.length > 0) {
    lines.push("  Recent artifacts:");
    for (const artifact of snapshot.artifacts.recent) {
      lines.push(`  - ${artifact.path} (${artifact.modifiedAt})`);
    }
  }
  if (snapshot.artifacts.error) {
    lines.push(chalk.yellow(`  Warning: ${snapshot.artifacts.error}`));
  }
  if (snapshot.artifacts.truncated) {
    lines.push(chalk.dim("  Artifact scan was bounded to keep the snapshot small."));
  }

  lines.push(divider(), header("Capabilities"), divider());
  for (const capability of snapshot.capabilities) {
    lines.push(`  ${formatStatusLine(capability)}`);
  }

  lines.push(divider(), header("Next"), divider());
  for (const command of snapshot.nextCommands) {
    lines.push(`  ${command}`);
  }

  return lines.join("\n");
}

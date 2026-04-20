import {
  type ComponentWeight,
  type CompositeEntry,
  composeFactors,
  deleteComposite,
  getComposite,
  listComposites,
} from "@tonquant/core";
import chalk from "chalk";
import type { Command } from "commander";
import { handleCommand } from "../utils/output.js";

// ── Component spec parser ────────────────────────────────────

function parseComponentSpec(spec: string): ComponentWeight[] {
  return spec.split(",").map((part) => {
    const trimmed = part.trim();
    const colonIdx = trimmed.lastIndexOf(":");
    if (colonIdx < 0) {
      throw new Error(`Invalid component spec "${trimmed}". Expected format: factorId:weight`);
    }
    const factorId = trimmed.slice(0, colonIdx);
    const weight = Number.parseFloat(trimmed.slice(colonIdx + 1));
    if (Number.isNaN(weight)) {
      throw new Error(`Invalid weight in "${trimmed}". Weight must be a number.`);
    }
    return { factorId, weight };
  });
}

// ── Composite ID generator ───────────────────────────────────

function nameToId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, "_")
    .replace(/_+/gu, "_")
    .replace(/^_|_$/gu, "")
    .slice(0, 64);
}

// ── Human formatters ─────────────────────────────────────────

function formatCompositeResult(entry: CompositeEntry): string {
  const { definition: def } = entry;
  const componentLines = def.components
    .map((c) => {
      const color = c.weight >= 0 ? chalk.cyan : chalk.yellow;
      return `    ${color(c.factorId)} ${color(`${(c.weight * 100).toFixed(1)}%`)}`;
    })
    .join("\n");

  const normLabel = def.normalizeWeights ? chalk.dim("[normalized]") : chalk.dim("[raw]");

  return (
    `${chalk.green("Composed")} ${chalk.cyan(def.id)} ${normLabel}\n` +
    `  ${def.name} — ${def.description}\n\n` +
    `  Components:\n${componentLines}\n\n` +
    `  ${chalk.dim("Next: run `tonquant factor evaluate --definition-file ... --liquidity-assumptions-file ... --cost-model-file ... --json` before publishing or ranking this composite.")}`
  );
}

function formatCompositeList(entries: CompositeEntry[]): string {
  if (entries.length === 0) return chalk.yellow("No composites saved.");
  const lines = entries.map((e) => {
    const { definition: def } = e;
    return (
      `  ${chalk.cyan(def.id)} ${def.name} ` + `${chalk.dim(`(${def.components.length} factors)`)}`
    );
  });
  return `${chalk.cyan("Composites")} (${entries.length})\n\n${lines.join("\n")}`;
}

function formatCompositeDetail(entry: CompositeEntry): string {
  const { definition: def } = entry;
  const normLabel = def.normalizeWeights ? chalk.dim("[normalized]") : chalk.dim("[raw]");

  const componentLines = def.components
    .map((c) => {
      const color = c.weight >= 0 ? chalk.cyan : chalk.yellow;
      return `    ${color(c.factorId)} ${color(`${(c.weight * 100).toFixed(1)}%`)}`;
    })
    .join("\n");

  return (
    `${chalk.cyan(def.id)} ${normLabel}\n` +
    `  ${def.name}\n` +
    `  ${chalk.dim(def.description)}\n\n` +
    `  Components:\n${componentLines}\n\n` +
    `  ${chalk.dim("This composite is a recipe only. Re-run factor evaluation before using it in marketplace flows.")}`
  );
}

// ── Command registration ─────────────────────────────────────

export function registerFactorComposeCommands(factor: Command): void {
  // ── compose ──
  factor
    .command("compose")
    .description("Create a weighted composite from existing factors")
    .requiredOption("--name <name>", "Composite display name")
    .requiredOption(
      "--components <spec>",
      "Comma-separated factorId:weight (e.g. mom_30d:0.6,vol_7d:0.4)",
    )
    .option("--description <desc>", "Composite description")
    .option("--no-normalize", "Skip weight normalization")
    .option("--publish", "Deprecated: composites must be re-evaluated before publishing")
    .option("--force", "Overwrite existing composite with same ID")
    .action(async (opts) => {
      const json = factor.parent?.opts().json ?? false;
      await handleCommand(
        { json },
        async () => {
          const components = parseComponentSpec(opts.components);
          const id = nameToId(opts.name);
          if (id.length < 3) {
            throw new Error(
              `Name "${opts.name}" produces an ID too short (min 3 chars). Use a longer name.`,
            );
          }
          const now = new Date().toISOString();

          const entry = composeFactors(
            {
              id,
              name: opts.name,
              description: opts.description || `Composite: ${opts.name}`,
              components,
              normalizeWeights: opts.normalize !== false,
              createdAt: now,
              updatedAt: now,
            },
            { force: opts.force },
          );

          if (opts.publish) {
            throw new Error(
              "Direct composite publishing is no longer supported. Compose first, then run factor evaluate on the composite definition and publish the evaluated factor.",
            );
          }

          return entry;
        },
        formatCompositeResult,
      );
    });

  // ── composites (list) ──
  factor
    .command("composites")
    .description("List saved composite factors")
    .action(async () => {
      const json = factor.parent?.opts().json ?? false;
      await handleCommand({ json }, async () => listComposites(), formatCompositeList);
    });

  // ── composite (detail) ──
  factor
    .command("composite <id>")
    .description("Show composite factor detail")
    .action(async (id: string) => {
      const json = factor.parent?.opts().json ?? false;
      await handleCommand({ json }, async () => getComposite(id), formatCompositeDetail);
    });

  // ── composite-delete ──
  factor
    .command("composite-delete <id>")
    .description("Delete a saved composite")
    .action(async (id: string) => {
      const json = factor.parent?.opts().json ?? false;
      await handleCommand(
        { json },
        async () => {
          const removed = deleteComposite(id);
          return { id, removed };
        },
        (r) =>
          r.removed
            ? `${chalk.yellow("Deleted")} composite ${chalk.cyan(r.id)}`
            : `${chalk.dim("Not found")} composite ${r.id}`,
      );
    });
}

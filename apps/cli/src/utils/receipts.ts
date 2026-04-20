import chalk from "chalk";
import {
  type MutationReceipt,
  type MutationReceiptInput,
  MutationReceiptSchema,
} from "../types/cli.js";

export type WithReceipt<T> = T & { receipt: MutationReceipt };

export function attachReceipt<T extends Record<string, unknown>>(
  data: T,
  receipt: MutationReceiptInput,
): WithReceipt<T> {
  return { ...data, receipt: MutationReceiptSchema.parse(receipt) };
}

export function hasMutationReceipt(value: unknown): value is { receipt: MutationReceipt } {
  if (!value || typeof value !== "object" || !("receipt" in value)) {
    return false;
  }
  return MutationReceiptSchema.safeParse((value as { receipt: unknown }).receipt).success;
}

export function formatMutationReceipt(receipt: MutationReceipt): string {
  const lines = [chalk.dim(`Receipt: ${receipt.action} -> ${receipt.target}`)];

  if (receipt.writes.length > 0) {
    lines.push(chalk.dim("Writes:"));
    for (const entry of receipt.writes) {
      lines.push(chalk.dim(`  - ${entry.kind}: ${entry.path}`));
    }
  }

  if (receipt.nextStep) {
    lines.push(chalk.dim(`Next: ${receipt.nextStep}`));
  }

  for (const warning of receipt.warnings) {
    lines.push(chalk.yellow(`Warning: ${warning}`));
  }

  return lines.join("\n");
}

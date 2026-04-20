import { seedRegistry } from "@tonquant/core";
import chalk from "chalk";
import type { Command } from "commander";
import { handleCommand } from "../utils/output.js";

export function registerFactorSeedCommands(factor: Command): void {
  factor
    .command("seed")
    .description("Populate registry with built-in starter factors")
    .option("--force", "Overwrite existing seed factors")
    .action(async (opts) => {
      const json = factor.parent?.opts().json ?? false;
      await handleCommand(
        { json },
        async () => {
          const count = seedRegistry({ force: opts.force });
          return { published: count };
        },
        (r) =>
          r.published > 0
            ? `${chalk.green("Seeded")} ${chalk.cyan(String(r.published))} factors into registry`
            : chalk.dim("Registry already contains seed factors. Use --force to overwrite."),
      );
    });
}

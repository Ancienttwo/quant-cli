import { writeFileSync } from "node:fs";
import { exportTopFactorsAsSkills, formatSkillMarkdown } from "@tonquant/core";
import chalk from "chalk";
import type { Command } from "commander";
import { handleCommand } from "../utils/output.js";

export function registerFactorSkillCommands(factor: Command): void {
  factor
    .command("skill-export")
    .description("Export top factors as agent skill definitions")
    .option("--limit <n>", "Number of factors to export", parseInt, 10)
    .option("--output <path>", "Write to file instead of stdout")
    .action(async (opts) => {
      const json = factor.parent?.opts().json ?? false;
      await handleCommand(
        { json },
        async () => {
          const skills = exportTopFactorsAsSkills(opts.limit);
          const markdown = formatSkillMarkdown(skills);

          if (opts.output) {
            writeFileSync(opts.output, markdown);
            return { skills: skills.length, output: opts.output, markdown: null };
          }
          return { skills: skills.length, output: null, markdown };
        },
        (r) => {
          if (r.output) {
            return `${chalk.green("Exported")} ${chalk.cyan(String(r.skills))} factor skills to ${chalk.cyan(r.output)}`;
          }
          return r.markdown ?? chalk.dim("No factors to export.");
        },
      );
    });
}

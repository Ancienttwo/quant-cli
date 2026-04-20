import { fetchBalanceData } from "@tonquant/core";
import type { Command } from "commander";
import type { GlobalCliOptions } from "../types/cli.js";
import { formatBalance } from "../utils/format.js";
import { handleCommand } from "../utils/output.js";

export function registerBalanceCommand(program: Command): void {
  program
    .command("balance")
    .description("Show wallet balance")
    .option("--all", "Include all jetton balances")
    .action(async (options: { all?: boolean }) => {
      const globalOptions = program.opts<GlobalCliOptions>();
      const json = globalOptions.json ?? false;
      await handleCommand(
        { json },
        () => fetchBalanceData(options.all ?? false, { configPath: globalOptions.config }),
        formatBalance,
      );
    });
}

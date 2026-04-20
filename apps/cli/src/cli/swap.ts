import { fetchSwapSimulation } from "@tonquant/core";
import { type Command, Option } from "commander";
import type { GlobalCliOptions } from "../types/cli.js";
import { formatSwapSimulation } from "../utils/format.js";
import { CliCommandError, handleCommand } from "../utils/output.js";

export function registerSwapCommand(program: Command): void {
  program
    .command("swap <from> <to> <amount>")
    .description("Simulate a token swap")
    .addOption(
      new Option("--execute", "Compatibility flag for deprecated swap execution").hideHelp(),
    )
    .option("--slippage <pct>", "Slippage tolerance percentage", "1")
    .action(
      async (
        from: string,
        to: string,
        amount: string,
        options: { execute?: boolean; slippage: string },
      ) => {
        const globalOptions = program.opts<GlobalCliOptions>();
        const json = globalOptions.json ?? false;

        await handleCommand(
          { json },
          async () => {
            if (options.execute) {
              throw new CliCommandError(
                "Swap execution is not part of the released package yet. The compatibility flag is hidden and returns simulation-only guidance.",
                "SWAP_EXECUTION_UNSUPPORTED",
              );
            }

            return fetchSwapSimulation(from, to, amount, options.slippage);
          },
          formatSwapSimulation,
        );
      },
    );
}

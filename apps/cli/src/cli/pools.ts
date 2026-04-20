import { fetchPoolData } from "@tonquant/core";
import type { Command } from "commander";
import { formatPool } from "../utils/format.js";
import { CliCommandError, handleCommand } from "../utils/output.js";

export function registerPoolsCommand(program: Command): void {
  program
    .command("pools <pair>")
    .description("Query trading pair pool details (e.g. NOT/TON)")
    .action(async (pair: string) => {
      const json = program.opts().json ?? false;

      await handleCommand(
        { json },
        () => {
          const parts = pair.split("/");
          if (parts.length !== 2 || !parts[0] || !parts[1]) {
            throw new CliCommandError(
              'Invalid pair format. Use "TOKEN_A/TOKEN_B"',
              "INVALID_PAIR_FORMAT",
            );
          }
          return fetchPoolData(parts[0], parts[1]);
        },
        formatPool,
      );
    });
}

import { fetchTrendingData } from "@tonquant/core";
import type { Command } from "commander";
import { formatTrending } from "../utils/format.js";
import { handleCommand } from "../utils/output.js";

export function registerTrendingCommand(program: Command): void {
  program
    .command("trending")
    .description("Show trending TON tokens ranked by STON.fi liquidity")
    .option("-n, --limit <number>", "Number of tokens to show", "10")
    .action(async (options: { limit: string }) => {
      const json = program.opts().json ?? false;
      const limit = Number.parseInt(options.limit, 10);
      await handleCommand({ json }, () => fetchTrendingData(limit), formatTrending);
    });
}

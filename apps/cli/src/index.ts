#!/usr/bin/env bun
import { Command } from "commander";
import { registerAutomationCommand, registerDaemonCommand } from "./cli/automation.js";
import { registerAutoresearchCommand } from "./cli/autoresearch.js";
import { registerBacktestCommand } from "./cli/backtest.js";
import { registerBalanceCommand } from "./cli/balance.js";
import { registerContextCommand } from "./cli/context.js";
import { registerDataCommand } from "./cli/data.js";
import { registerFactorCommand } from "./cli/factor.js";
import { registerHistoryCommand } from "./cli/history.js";
import { registerInitCommand } from "./cli/init.js";
import { registerPoolsCommand } from "./cli/pools.js";
import { registerPresetCommand } from "./cli/preset.js";
import { RESEARCH_ACTIONS, registerResearchCommand } from "./cli/research.js";
import { registerSignalCommand } from "./cli/signal.js";
import { registerSwapCommand } from "./cli/swap.js";
import { registerTrendingCommand } from "./cli/trending.js";
import { runOkxProxyAndExit } from "./okx/proxy.js";
import { exitWithError } from "./utils/output.js";
import { TONQUANT_VERSION } from "./version.js";

const program = new Command();

program
  .name("tonquant")
  .description("Multi-surface research and trading CLI for AI Agents")
  .version(TONQUANT_VERSION)
  .option("--json", "Output structured JSON for AI agent consumption")
  .option("--testnet", "Use testnet network")
  .option("--config <path>", "Custom config file path");

registerTrendingCommand(program);
registerContextCommand(program);
registerPoolsCommand(program);
registerInitCommand(program);
registerBalanceCommand(program);
registerSwapCommand(program);
registerResearchCommand(program);
registerHistoryCommand(program);
registerDataCommand(program);
registerSignalCommand(program);
registerFactorCommand(program);
registerBacktestCommand(program);
registerPresetCommand(program);
registerAutoresearchCommand(program);
registerAutomationCommand(program);
registerDaemonCommand(program);

function positionalArgs(argv: string[]): string[] {
  const args: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;
    if (token === "--") {
      args.push(...argv.slice(index + 1));
      break;
    }
    if (token === "--config") {
      index += 1;
      continue;
    }
    if (token.startsWith("-")) {
      continue;
    }
    args.push(token);
  }
  return args;
}

function interceptRemovedCommands(argv: string[]): void {
  const json = argv.includes("--json");
  const args = positionalArgs(argv);
  const command = args[0];
  const action = args[1];

  if (command === "market") {
    const suffix =
      action && ["quote", "search", "compare", "candles"].includes(action)
        ? ` Use 'tonquant research ${action} <${action === "search" ? "query" : "symbol"}>' instead.`
        : " Use 'tonquant research quote <symbol>', 'research search <query>', 'research compare <symbol>', or 'research candles <symbol>' instead.";
    exitWithError(`Command 'market' has been removed.${suffix}`, "CLI_MARKET_COMMAND_REMOVED", {
      json,
    });
  }

  if (command === "price") {
    exitWithError(
      "Command 'price' has been removed. Use 'tonquant research quote <symbol>' for OKX-first public-market quotes or 'tonquant research liquidity <symbol>' for the deprecated TON liquidity compatibility path.",
      "CLI_PRICE_COMMAND_REMOVED",
      { json },
    );
  }

  if (command === "research" && action && !RESEARCH_ACTIONS.includes(action as never)) {
    exitWithError(
      `Unsupported research action '${action}'. Use one of: ${RESEARCH_ACTIONS.join(", ")}. If '${action}' is a symbol, use 'tonquant research quote ${action}' for OKX-first public-market quotes or 'tonquant research liquidity ${action}' for the deprecated TON liquidity compatibility path.`,
      "CLI_RESEARCH_ACTION_REQUIRED",
      { json },
    );
  }
}

function findCommandIndex(argv: string[]): number {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;
    if (token === "--config") {
      index += 1;
      continue;
    }
    if (token.startsWith("-")) {
      continue;
    }
    return index;
  }
  return -1;
}

function interceptOkxCommand(argv: string[]): void {
  const commandIndex = findCommandIndex(argv);
  if (commandIndex === -1 || argv[commandIndex] !== "okx") {
    return;
  }

  runOkxProxyAndExit(argv.slice(commandIndex + 1), {
    json: argv.includes("--json"),
    testnet: argv.includes("--testnet"),
  });
}

interceptRemovedCommands(process.argv.slice(2));
interceptOkxCommand(process.argv.slice(2));
program.parse();

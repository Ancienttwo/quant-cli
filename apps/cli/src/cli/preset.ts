import type { Command } from "commander";
import { runPresetList, runPresetShow } from "../quant/api/preset.js";
import { formatPresetList, formatPresetShow } from "../utils/format-quant.js";
import { handleCommand } from "../utils/output.js";

export function registerPresetCommand(program: Command): void {
  const command = program.command("preset").description("Quant strategy presets [Phase 1]");

  command
    .command("list")
    .description("List built-in quant presets")
    .action(async () => {
      const json = program.opts().json ?? false;
      await handleCommand({ json }, () => runPresetList(), formatPresetList);
    });

  command
    .command("show <presetId>")
    .description("Show a quant preset definition")
    .action(async (presetId: string) => {
      const json = program.opts().json ?? false;
      await handleCommand({ json }, () => runPresetShow({ presetId }), formatPresetShow);
    });
}

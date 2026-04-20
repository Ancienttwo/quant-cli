import type { AuthorProfile } from "@tonquant/core";
import type { Command } from "commander";
import { fetchAuthorProfile, resolvePlatformUrl } from "../automation/platform-client.js";
import { formatAuthorProfile } from "../utils/format-marketplace.js";
import { handleCommand } from "../utils/output.js";

interface FactorAuthorShowOptions {
  platformUrl?: string;
}

export function registerFactorAuthorCommands(factor: Command): void {
  const author = factor
    .command("author")
    .description("Browse publisher profiles from the marketplace platform");

  author
    .command("show <wallet>")
    .description("Show the live marketplace profile summary for one publisher wallet")
    .option("--platform-url <url>", "Platform API origin; defaults to env or http://localhost:3001")
    .action(async (wallet: string, opts: FactorAuthorShowOptions) => {
      const json = factor.parent?.opts().json ?? false;
      await handleCommand(
        { json },
        async (): Promise<AuthorProfile> =>
          fetchAuthorProfile({
            platformUrl: resolvePlatformUrl(opts.platformUrl),
            wallet,
          }),
        formatAuthorProfile,
      );
    });
}

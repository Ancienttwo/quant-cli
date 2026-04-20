import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import type { Command } from "commander";
import {
  createPullSession,
  exchangePullSession,
  resolvePlatformUrl,
} from "../automation/platform-client.js";
import { CliCommandError, handleCommand } from "../utils/output.js";
import { attachReceipt } from "../utils/receipts.js";

interface FactorPullOptions {
  outputDir: string;
  platformUrl?: string;
  timeoutMs?: string;
}

interface LoopbackResult {
  callbackUrl: string;
  waitForCode: Promise<{ pullSessionId: string; code: string }>;
  close: () => Promise<void>;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function printCheckoutUrl(url: string): void {
  process.stderr.write(`Open this checkout URL to continue payment:\n${url}\n`);
}

async function bestEffortOpen(url: string): Promise<boolean> {
  if (process.env.TONQUANT_DISABLE_BROWSER_OPEN === "1") {
    return false;
  }

  const platform = process.platform;
  const commands =
    platform === "darwin"
      ? [["open", url]]
      : platform === "win32"
        ? [["cmd", "/c", "start", "", url]]
        : [["xdg-open", url]];

  for (const cmd of commands) {
    const result = Bun.spawnSync({ cmd, stdout: "ignore", stderr: "ignore" });
    if (result.exitCode === 0) {
      return true;
    }
  }

  return false;
}

async function startLoopbackListener(timeoutMs: number): Promise<LoopbackResult> {
  let resolveCode: ((value: { pullSessionId: string; code: string }) => void) | null = null;
  let rejectCode: ((error: Error) => void) | null = null;
  const waitForCode = new Promise<{ pullSessionId: string; code: string }>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST,OPTIONS",
        "access-control-allow-headers": "content-type",
      });
      res.end();
      return;
    }
    if (req.method !== "POST" || url.pathname !== "/tonquant/pull-callback") {
      res.writeHead(404, {
        "access-control-allow-origin": "*",
      });
      res.end("not found");
      return;
    }

    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as {
          pullSessionId?: string;
          code?: string;
        };
        if (!parsed.pullSessionId || !parsed.code) {
          throw new Error("Missing pullSessionId or code.");
        }
        res.writeHead(200, {
          "access-control-allow-origin": "*",
          "content-type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify({ status: "ok" }));
        resolveCode?.({ pullSessionId: parsed.pullSessionId, code: parsed.code });
      } catch (error) {
        res.writeHead(400, {
          "access-control-allow-origin": "*",
          "content-type": "application/json; charset=utf-8",
        });
        res.end(
          JSON.stringify({
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new CliCommandError(
      "Failed to bind local loopback listener.",
      "CLI_LOOPBACK_BIND_FAILED",
    );
  }

  const timer = setTimeout(() => {
    rejectCode?.(
      new CliCommandError("Timed out waiting for paid pull callback.", "CLI_PULL_TIMEOUT"),
    );
  }, timeoutMs);

  return {
    callbackUrl: `http://127.0.0.1:${address.port}/tonquant/pull-callback`,
    waitForCode: waitForCode.finally(() => clearTimeout(timer)),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

function parseTimeoutMs(raw?: string): number {
  if (!raw) return 10 * 60 * 1000;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1_000) {
    throw new CliCommandError("--timeout-ms must be an integer >= 1000.", "CLI_ARGUMENT_INVALID");
  }
  return parsed;
}

export function registerFactorPullCommands(factor: Command): void {
  factor
    .command("pull <factorSlug>")
    .description("Buy and pull the paid artifact bundle into your local CLI workspace")
    .requiredOption("--output-dir <dir>", "Directory to store the pulled artifact bundle")
    .option("--platform-url <url>", "Platform API origin; defaults to env or http://localhost:3001")
    .option("--timeout-ms <ms>", "Loopback wait timeout in milliseconds", "600000")
    .action(async (factorSlug: string, opts: FactorPullOptions) => {
      const json = factor.parent?.opts().json ?? false;
      await handleCommand(
        { json },
        async () => {
          const timeoutMs = parseTimeoutMs(opts.timeoutMs);
          const listener = await startLoopbackListener(timeoutMs);
          try {
            const session = await createPullSession({
              platformUrl: resolvePlatformUrl(opts.platformUrl),
              factorSlug,
              callbackUrl: listener.callbackUrl,
            });
            const opened = await bestEffortOpen(session.checkoutUrl);
            if (!opened) {
              printCheckoutUrl(session.checkoutUrl);
            }
            const callback = await listener.waitForCode;
            if (callback.pullSessionId !== session.pullSessionId) {
              throw new CliCommandError(
                "Loopback callback pull session mismatch.",
                "CLI_PULL_SESSION_MISMATCH",
              );
            }

            const grant = await exchangePullSession({
              platformUrl: resolvePlatformUrl(opts.platformUrl),
              pullSessionId: session.pullSessionId,
              code: callback.code,
            });
            const response = await fetch(grant.downloadUrl, {
              headers: {
                authorization: `Bearer ${grant.token}`,
              },
            });
            if (!response.ok) {
              throw new CliCommandError(
                `Artifact download failed with status ${response.status}.`,
                "PLATFORM_ARTIFACT_DOWNLOAD_FAILED",
              );
            }
            const bytes = new Uint8Array(await response.arrayBuffer());
            const actualSha256 = sha256Hex(bytes);
            if (actualSha256 !== grant.bundleSha256) {
              throw new CliCommandError(
                "Downloaded artifact hash does not match the platform grant.",
                "PLATFORM_ARTIFACT_HASH_MISMATCH",
              );
            }

            mkdirSync(opts.outputDir, { recursive: true, mode: 0o700 });
            const outputPath = join(opts.outputDir, grant.bundleFileName);
            writeFileSync(outputPath, bytes, { mode: 0o600 });

            return attachReceipt(
              {
                pullSessionId: session.pullSessionId,
                subscriptionId: grant.subscriptionId,
                factorSlug: grant.factorSlug,
                factorVersion: grant.factorVersion,
                outputPath,
                bundleSha256: grant.bundleSha256,
                sizeBytes: grant.sizeBytes,
                checkoutUrl: session.checkoutUrl,
              },
              {
                action: "factor.pull",
                target: factorSlug,
                writes: [{ kind: "file", path: outputPath }],
                nextStep: `Verify the bundle locally, then import it into your own research or execution stack.`,
              },
            );
          } finally {
            await listener.close().catch(() => {});
          }
        },
        (result) =>
          [
            `Pulled paid artifact for ${result.factorSlug}@${result.factorVersion}`,
            `Saved: ${result.outputPath}`,
            `SHA256: ${result.bundleSha256}`,
            `Checkout: ${result.checkoutUrl}`,
          ].join("\n"),
      );
    });
}

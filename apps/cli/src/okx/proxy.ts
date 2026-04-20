import { existsSync, realpathSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CliCommandError, formatError, formatOutput, printAndExit } from "../utils/output.js";

function parseCommand(command: string): string[] {
  return command
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

interface ResolveOkxCliContext {
  argv1?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
  moduleUrl?: string;
}

function normalizePath(cwd: string, target: string): string {
  return isAbsolute(target) ? target : resolve(cwd, target);
}

function findCandidate(
  candidates: string[],
  pathExists: (path: string) => boolean,
): string | undefined {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    if (pathExists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function findOnPath(
  binaryName: string,
  envPath: string | undefined,
  pathExists: (path: string) => boolean,
): string | undefined {
  if (!envPath) {
    return undefined;
  }

  const candidates = envPath
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) =>
      process.platform === "win32"
        ? [
            join(entry, `${binaryName}.cmd`),
            join(entry, `${binaryName}.exe`),
            join(entry, binaryName),
          ]
        : [join(entry, binaryName)],
    );

  return findCandidate(candidates, pathExists);
}

export function resolveOkxCliWithContext({
  argv1 = process.argv[1],
  cwd = process.cwd(),
  env = process.env,
  exists = existsSync,
  moduleUrl = import.meta.url,
}: ResolveOkxCliContext = {}): string[] {
  const explicit = env.TONQUANT_OKX_CLI;
  if (explicit) {
    return parseCommand(explicit);
  }

  const moduleDir = dirname(fileURLToPath(moduleUrl));
  const normalizedArgv1 =
    typeof argv1 === "string" && argv1.length > 0 ? normalizePath(cwd, argv1) : undefined;
  const entryPath =
    normalizedArgv1 && exists(normalizedArgv1) ? realpathSync(normalizedArgv1) : normalizedArgv1;
  const entryDir = entryPath ? dirname(entryPath) : undefined;

  const okxPath =
    findOnPath("okx", env.PATH, exists) ??
    findCandidate(
      [
        ...(entryDir ? [join(entryDir, "..", "bin", "okx"), join(entryDir, "bin", "okx")] : []),
        resolve(moduleDir, "../../bin/okx"),
      ],
      exists,
    );

  if (okxPath) {
    return [okxPath];
  }

  throw new CliCommandError(
    "OKX Agent Trade Kit CLI is not installed. Install the official OKX tool (for example `npm install -g @okx_ai/okx-trade-cli` or `npx skills add okx/agent-skills`), then retry or set TONQUANT_OKX_CLI explicitly.",
    "OKX_CLI_NOT_CONFIGURED",
  );
}

export function resolveOkxCli(): string[] {
  return resolveOkxCliWithContext();
}

function sanitizeOkxArgs(argv: string[], json: boolean, testnet: boolean): string[] {
  const sanitized: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;
    if (token === "--config") {
      index += 1;
      continue;
    }
    if (token === "--json" || token === "--testnet") {
      continue;
    }
    sanitized.push(token);
  }

  const withMode = json
    ? ["--json", ...sanitized.filter((token) => token !== "--json")]
    : sanitized;
  if (testnet && !withMode.includes("--demo") && !withMode.includes("--live")) {
    return ["--demo", ...withMode];
  }
  return withMode;
}

export function runOkxProxyAndExit(
  argv: string[],
  options: { json: boolean; testnet: boolean },
): never {
  try {
    const okxArgs = sanitizeOkxArgs(argv, options.json, options.testnet);
    const command = [...resolveOkxCli(), ...okxArgs];
    const result = Bun.spawnSync({
      cmd: command,
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });

    const stdout = result.stdout.toString("utf-8").trim();
    const stderr = result.stderr.toString("utf-8").trim();

    if (result.exitCode !== 0) {
      const message = stderr || stdout || "OKX CLI command failed.";
      printAndExit(formatError(message, "OKX_CLI_FAILED", { json: options.json }), 1);
    }

    if (options.json) {
      let parsed: unknown;
      try {
        parsed = stdout.length > 0 ? JSON.parse(stdout) : null;
      } catch {
        throw new CliCommandError(
          "OKX CLI returned non-JSON output while TonQuant requested JSON mode.",
          "OKX_JSON_INVALID",
        );
      }
      printAndExit(
        formatOutput(
          {
            provider: "okx-agent-trade-kit",
            command: okxArgs,
            result: parsed,
          },
          { json: true },
        ),
        0,
      );
    }

    const rendered = stdout || stderr || "OKX CLI command completed.";
    printAndExit(rendered, 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof CliCommandError ? error.code : "OKX_PROXY_FAILED";
    printAndExit(formatError(message, code, { json: options.json }), 1);
  }
}

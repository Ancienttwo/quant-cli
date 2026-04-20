import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CliCommandError } from "../../utils/output.js";

function parseCommand(command: string): string[] {
  return command
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

interface ResolveQuantCliContext {
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

export function resolveQuantCliWithContext({
  argv1 = process.argv[1],
  cwd = process.cwd(),
  env = process.env,
  exists = existsSync,
  moduleUrl = import.meta.url,
}: ResolveQuantCliContext = {}): string[] {
  const explicit = env.TONQUANT_QUANT_CLI;
  if (explicit) {
    return parseCommand(explicit);
  }

  const pythonProject = env.TONQUANT_QUANT_PYTHON_PROJECT;
  if (pythonProject) {
    return ["uv", "run", "--project", pythonProject, "tonquant-quant-cli"];
  }

  const localProject = join(cwd, "quant-python");
  if (exists(localProject)) {
    return ["uv", "run", "--project", localProject, "tonquant-quant-cli"];
  }

  const moduleDir = dirname(fileURLToPath(moduleUrl));
  const normalizedArgv1 =
    typeof argv1 === "string" && argv1.length > 0 ? normalizePath(cwd, argv1) : undefined;
  const entryPath =
    normalizedArgv1 && exists(normalizedArgv1) ? realpathSync(normalizedArgv1) : normalizedArgv1;
  const entryDir = entryPath ? dirname(entryPath) : undefined;

  // Search order:
  //   explicit env -> Python project -> packaged dist -> source-monorepo -> cwd fallbacks
  const backendPath = findCandidate(
    [
      ...(entryDir ? [join(entryDir, "quant-backend.js")] : []),
      join(moduleDir, "quant-backend.js"),
      resolve(moduleDir, "../../../../quant-backend/src/cli.ts"),
      join(cwd, "apps", "quant-backend", "src", "cli.ts"),
      join(cwd, "quant-backend", "cli.ts"),
    ],
    exists,
  );
  if (backendPath) {
    return ["bun", "run", backendPath];
  }

  throw new CliCommandError(
    "Quant backend is not configured. Set TONQUANT_QUANT_CLI or TONQUANT_QUANT_PYTHON_PROJECT.",
    "QUANT_BACKEND_NOT_CONFIGURED",
  );
}

export function resolveQuantCli(): string[] {
  return resolveQuantCliWithContext();
}

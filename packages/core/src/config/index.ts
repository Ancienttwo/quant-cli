import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ServiceError } from "../errors.js";
import type { Config } from "../types/config.js";
import { CONFIG_FILE, ConfigSchema } from "../types/config.js";

export interface ConfigFileOptions {
  configPath?: string;
}

function resolveConfigPath(options: ConfigFileOptions = {}): string {
  return options.configPath ?? CONFIG_FILE;
}

/**
 * Ensure the config directory exists.
 */
export async function ensureConfigDir(options: ConfigFileOptions = {}): Promise<void> {
  const configDir = dirname(resolveConfigPath(options));
  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Load and validate configuration from disk.
 * Returns default config if file doesn't exist.
 */
export async function loadConfig(options: ConfigFileOptions = {}): Promise<Config> {
  const configPath = resolveConfigPath(options);

  if (!existsSync(configPath)) {
    return ConfigSchema.parse({});
  }

  try {
    const raw = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return ConfigSchema.parse(parsed);
  } catch (err) {
    throw new ServiceError(
      `Failed to load config from ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
      "CONFIG_LOAD_ERROR",
    );
  }
}

/**
 * Save configuration to disk with restricted permissions.
 * Creates a new config object (immutability).
 */
export async function saveConfig(config: Config, options: ConfigFileOptions = {}): Promise<void> {
  const configPath = resolveConfigPath(options);
  await ensureConfigDir(options);
  const content = JSON.stringify(config, null, 2);
  await writeFile(configPath, content, { encoding: "utf-8" });
  await chmod(configPath, 0o600);
}

/**
 * Get the config file path.
 */
export function getConfigPath(options: ConfigFileOptions = {}): string {
  return resolveConfigPath(options);
}

/**
 * Get the active config directory.
 */
export function getConfigDir(options: ConfigFileOptions = {}): string {
  return dirname(resolveConfigPath(options));
}

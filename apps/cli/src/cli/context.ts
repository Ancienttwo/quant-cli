import { Database } from "bun:sqlite";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  CONFIG_DIR,
  getConfigDir,
  getConfigPath,
  getKeyfilePath,
  listAutomationJobs,
  listFactors,
  listReports,
  loadConfig,
} from "@tonquant/core";
import type { Command } from "commander";
import { listTracks } from "../quant/autoresearch/service.js";
import { TONQUANT_QUANT_ROOT } from "../quant/types/base.js";
import type { GlobalCliOptions } from "../types/cli.js";
import { formatContextSnapshot } from "../utils/format-context.js";
import { handleCommand } from "../utils/output.js";
import { TONQUANT_VERSION } from "../version.js";

const DEFAULT_SAMPLE_LIMIT = 5;
const DEFAULT_PLATFORM_DB_PATH = join(
  process.env.HOME ?? "/tmp",
  ".tonquant",
  "platform",
  "platform.sqlite",
);
const MAX_ARTIFACT_SCAN = 200;

export interface ContextCollectionSummary {
  total: number;
  recent: string[];
  error?: string;
}

export interface ContextArtifactSummary {
  path: string;
  modifiedAt: string;
  sizeBytes: number;
}

export interface ContextArtifactState {
  root: string;
  exists: boolean;
  total: number;
  recent: ContextArtifactSummary[];
  truncated: boolean;
  error?: string;
}

export interface ContextSnapshotSectionStatus {
  name: string;
  status: "ready" | "handoff" | "hidden" | "local-only";
  details: string;
}

export interface TonQuantContextSnapshot {
  version: string;
  generatedAt: string;
  runtime: {
    bun: string;
    platform: string;
    cwd: string;
  };
  config: {
    path: string;
    exists: boolean;
    customPath: boolean;
    network: string | null;
    walletAddress: string | null;
    keyfilePath: string;
    keyfileExists: boolean;
    error?: string;
  };
  stores: {
    activeConfigDir: string;
    defaultConfigRoot: string;
    quantRoot: string;
    platformDbPath: string;
  };
  registry: ContextCollectionSummary;
  reports: ContextCollectionSummary;
  automation: ContextCollectionSummary;
  autoresearch: ContextCollectionSummary;
  signingSessions: ContextCollectionSummary;
  publications: ContextCollectionSummary;
  artifacts: ContextArtifactState;
  capabilities: ContextSnapshotSectionStatus[];
  nextCommands: string[];
}

interface ContextOptions {
  configPath?: string;
  platformDbPath?: string;
  quantRoot?: string;
  cwd?: string;
  limit?: number;
  now?: string;
  loaders?: {
    listFactors?: typeof listFactors;
    listReports?: typeof listReports;
    listAutomationJobs?: typeof listAutomationJobs;
    listTracks?: typeof listTracks;
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function collectSummary<T>(
  loader: () => Promise<T> | T,
  project: (value: T) => ContextCollectionSummary,
): Promise<ContextCollectionSummary> {
  try {
    return project(await loader());
  } catch (error) {
    return { total: 0, recent: [], error: describeError(error) };
  }
}

function collectPlatformSummary(
  dbPath: string,
  tableName: "signing_sessions" | "publications",
  idColumn: string,
  descriptor: (row: Record<string, unknown>) => string,
  limit: number,
): ContextCollectionSummary {
  if (!existsSync(dbPath)) {
    return { total: 0, recent: [] };
  }

  const db = new Database(dbPath, { readonly: true });
  try {
    const hasTable = db
      .query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(tableName) as { name?: string } | null;
    if (!hasTable?.name) {
      return { total: 0, recent: [] };
    }

    const totalRow = db.query(`SELECT COUNT(*) as total FROM ${tableName}`).get() as {
      total?: number;
    } | null;
    const total = Number(totalRow?.total ?? 0);
    const rows = db
      .query(
        `SELECT ${idColumn} as id, factor_slug, factor_version, status, updated_at, created_at
         FROM ${tableName}
         ORDER BY COALESCE(updated_at, created_at) DESC
         LIMIT ?`,
      )
      .all(limit) as Array<Record<string, unknown>>;

    return {
      total,
      recent: rows.map(descriptor),
    };
  } catch (error) {
    return { total: 0, recent: [], error: describeError(error) };
  } finally {
    db.close();
  }
}

function scanArtifacts(root: string, limit: number): ContextArtifactState {
  if (!existsSync(root)) {
    return {
      root,
      exists: false,
      total: 0,
      recent: [],
      truncated: false,
    };
  }

  try {
    const queue = [root];
    const files: Array<{ path: string; modifiedAt: string; sizeBytes: number; mtimeMs: number }> =
      [];
    let scanned = 0;
    let truncated = false;

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const fullPath = join(current, entry.name);
        if (entry.isDirectory()) {
          queue.push(fullPath);
          continue;
        }
        if (!entry.isFile()) {
          continue;
        }

        const stats = statSync(fullPath);
        files.push({
          path: relative(root, fullPath) || entry.name,
          modifiedAt: new Date(stats.mtimeMs).toISOString(),
          sizeBytes: stats.size,
          mtimeMs: stats.mtimeMs,
        });

        scanned += 1;
        if (scanned >= MAX_ARTIFACT_SCAN) {
          truncated = true;
          queue.length = 0;
          break;
        }
      }
    }

    const recent = [...files]
      .sort((left, right) => right.mtimeMs - left.mtimeMs)
      .slice(0, limit)
      .map(({ mtimeMs: _mtimeMs, ...artifact }) => artifact);

    return {
      root,
      exists: true,
      total: files.length,
      recent,
      truncated,
    };
  } catch (error) {
    return {
      root,
      exists: true,
      total: 0,
      recent: [],
      truncated: false,
      error: describeError(error),
    };
  }
}

export async function buildContextSnapshot(
  options: ContextOptions = {},
): Promise<TonQuantContextSnapshot> {
  const limit = options.limit ?? DEFAULT_SAMPLE_LIMIT;
  const configPath = getConfigPath({ configPath: options.configPath });
  const keyfilePath = getKeyfilePath({ configPath: options.configPath });
  const platformDbPath = options.platformDbPath ?? DEFAULT_PLATFORM_DB_PATH;
  const quantRoot = options.quantRoot ?? TONQUANT_QUANT_ROOT;
  const configExists = existsSync(configPath);

  const configResult = configExists
    ? await collectSummary(
        () => loadConfig({ configPath: options.configPath }),
        (config) => ({
          total: config.wallet ? 1 : 0,
          recent: config.wallet ? [config.wallet.address] : [],
        }),
      )
    : { total: 0, recent: [] };
  const loadedConfig =
    configExists && configResult.error === undefined
      ? await loadConfig({ configPath: options.configPath })
      : null;

  const registry = await collectSummary(
    () => (options.loaders?.listFactors ?? listFactors)(),
    (factors) => ({
      total: factors.length,
      recent: [...factors]
        .slice(-limit)
        .reverse()
        .map((factor) => `${factor.id}@${factor.version}`),
    }),
  );
  const reports = await collectSummary(
    () => (options.loaders?.listReports ?? listReports)(),
    (entries) => ({
      total: entries.length,
      recent: [...entries]
        .slice(-limit)
        .reverse()
        .map((entry) => `${entry.factorId}:${entry.period}`),
    }),
  );
  const automation = await collectSummary(
    () => (options.loaders?.listAutomationJobs ?? listAutomationJobs)(),
    (jobs) => ({
      total: jobs.length,
      recent: [...jobs]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, limit)
        .map((job) => `${job.jobId}:${job.status}`),
    }),
  );
  const autoresearch = await collectSummary(
    () => (options.loaders?.listTracks ?? listTracks)({}),
    (tracks) => ({
      total: tracks.tracks.length,
      recent: [...tracks.tracks]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, limit)
        .map((track) => `${track.trackId}:${track.status}`),
    }),
  );
  const signingSessions = collectPlatformSummary(
    platformDbPath,
    "signing_sessions",
    "session_id",
    (row) => `${String(row.id)}:${String(row.status)}:${String(row.factor_slug)}`,
    limit,
  );
  const publications = collectPlatformSummary(
    platformDbPath,
    "publications",
    "publication_id",
    (row) =>
      `${String(row.id)}:${String(row.status)}:${String(row.factor_slug)}@${String(row.factor_version)}`,
    limit,
  );
  const artifacts = scanArtifacts(quantRoot, limit);

  const configFlag = options.configPath ? ` --config ${options.configPath}` : "";
  const nextCommands = loadedConfig?.wallet
    ? [
        `tonquant context${configFlag} --json`,
        `tonquant balance${configFlag} --json`,
        `tonquant history${configFlag} --json`,
      ]
    : [
        `tonquant context${configFlag} --json`,
        `tonquant init${configFlag} --mnemonic '<24 words>' --json`,
        "tonquant factor discover --json",
      ];

  if (publications.recent[0]) {
    const publicationId = publications.recent[0].split(":")[0];
    if (publicationId) {
      nextCommands.push(`tonquant factor publish-status ${publicationId} --json`);
    }
  }

  return {
    version: TONQUANT_VERSION,
    generatedAt: options.now ?? new Date().toISOString(),
    runtime: {
      bun: Bun.version,
      platform: process.platform,
      cwd: options.cwd ?? process.cwd(),
    },
    config: {
      path: configPath,
      exists: configExists,
      customPath: Boolean(options.configPath),
      network: loadedConfig?.network ?? null,
      walletAddress: loadedConfig?.wallet?.address ?? null,
      keyfilePath,
      keyfileExists: existsSync(keyfilePath),
      error: configResult.error,
    },
    stores: {
      activeConfigDir: getConfigDir({ configPath: options.configPath }),
      defaultConfigRoot: CONFIG_DIR,
      quantRoot,
      platformDbPath,
    },
    registry,
    reports,
    automation,
    autoresearch,
    signingSessions,
    publications,
    artifacts,
    capabilities: [
      {
        name: "context --json",
        status: "local-only",
        details: "Bounded local snapshot of config, jobs, tracks, publications, and artifacts.",
      },
      {
        name: "--config",
        status: "ready",
        details: "Explicit config path is honored by init, balance, history, and context.",
      },
      {
        name: "factor publish-request-signature",
        status: "handoff",
        details: "Creates a signing session and hands the user or agent off to the signer URL.",
      },
      {
        name: "factor payout-request-signature",
        status: "handoff",
        details: "Creates a payout signature session and returns the next step explicitly.",
      },
      {
        name: "swap --execute",
        status: "hidden",
        details:
          "Accepted only as a compatibility flag and returns a structured unsupported error.",
      },
    ],
    nextCommands,
  };
}

export function registerContextCommand(program: Command): void {
  program
    .command("context")
    .description("Show a bounded local context snapshot for agents")
    .action(async () => {
      const globalOptions = program.opts<GlobalCliOptions>();
      await handleCommand(
        { json: globalOptions.json ?? false },
        () => buildContextSnapshot({ configPath: globalOptions.config }),
        formatContextSnapshot,
      );
    });
}

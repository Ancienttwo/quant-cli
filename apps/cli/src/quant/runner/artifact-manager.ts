import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  ArtifactKindSchema,
  type ArtifactRef,
  type QuantArtifactDomain,
  TONQUANT_QUANT_ROOT,
} from "../types/base.js";

const FILESYSTEM_SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
  }
}

function resolveQuantRoot(outputDir?: string): string {
  if (!outputDir) return TONQUANT_QUANT_ROOT;
  return join(outputDir, "quant");
}

function assertFilesystemSafeId(id: string, label: string): string {
  if (!FILESYSTEM_SAFE_ID.test(id)) {
    throw new Error(
      `Expected ${label} to be a filesystem-safe identifier (letters, digits, hyphen, underscore).`,
    );
  }
  return id;
}

function inferArtifactKind(path: string): ArtifactRef["kind"] {
  if (path.endsWith(".json") || path.endsWith(".jsonl")) return "json";
  if (path.endsWith(".log") || path.endsWith(".txt")) return "log";
  if (path.endsWith(".csv") || path.endsWith(".parquet")) return "dataset";
  if (path.endsWith(".md")) return "table";
  if (path.endsWith(".png") || path.endsWith(".svg")) return "chart";
  return "file";
}

export function createQuantArtifactDir(
  domain: QuantArtifactDomain,
  runId: string,
  outputDir?: string,
): string {
  const artifactDir = join(
    resolveQuantRoot(outputDir),
    domain,
    assertFilesystemSafeId(runId, "runId"),
  );
  ensureDir(artifactDir);
  return artifactDir;
}

export function createAutoresearchTrackDir(trackId: string, outputDir?: string): string {
  const trackDir = join(
    resolveQuantRoot(outputDir),
    "autoresearch",
    assertFilesystemSafeId(trackId, "trackId"),
  );
  ensureDir(join(trackDir, "candidates"));
  return trackDir;
}

export function createAutoresearchRunDir(runId: string, outputDir?: string): string {
  const runDir = join(
    resolveQuantRoot(outputDir),
    "autoresearch-runs",
    assertFilesystemSafeId(runId, "runId"),
  );
  ensureDir(runDir);
  return runDir;
}

export function writeArtifactJson(artifactDir: string, fileName: string, data: unknown): void {
  ensureDir(artifactDir);
  writeFileSync(join(artifactDir, fileName), `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

export function writeArtifactText(artifactDir: string, fileName: string, content: string): void {
  ensureDir(artifactDir);
  writeFileSync(join(artifactDir, fileName), content, "utf-8");
}

function listArtifactPaths(root: string): string[] {
  if (!existsSync(root)) return [];
  const entries = readdirSync(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listArtifactPaths(entryPath));
      continue;
    }
    if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

export function listArtifacts(artifactDir: string): ArtifactRef[] {
  return listArtifactPaths(artifactDir).map((path) => ({
    path,
    label: relative(artifactDir, path) || path,
    kind: inferArtifactKind(path),
  }));
}

export function normalizeArtifacts(artifactDir: string, artifacts: ArtifactRef[]): ArtifactRef[] {
  return artifacts.map((artifact) => {
    const path = artifact.path.startsWith("/") ? artifact.path : join(artifactDir, artifact.path);
    return {
      path,
      label: artifact.label ?? (relative(artifactDir, path) || path),
      kind: ArtifactKindSchema.parse(artifact.kind ?? inferArtifactKind(path)),
    };
  });
}

export function readArtifactStat(path: string): { path: string; sizeBytes: number } {
  const stats = statSync(path);
  return {
    path,
    sizeBytes: stats.size,
  };
}

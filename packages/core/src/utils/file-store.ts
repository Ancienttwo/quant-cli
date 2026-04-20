import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { z } from "zod";
import { ServiceError } from "../errors.js";

export interface FileSnapshot {
  path: string;
  existed: boolean;
  content?: Buffer;
}

export function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
  }
}

export function ensureParentDir(path: string): void {
  ensureDir(dirname(path));
}

export function writeJsonFileAtomic(path: string, data: unknown): void {
  ensureParentDir(path);
  const tmp = join(dirname(path), `.${randomBytes(4).toString("hex")}-${Date.now()}.json.tmp`);
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  renameSync(tmp, path);
}

export function appendTextFile(path: string, content: string): void {
  ensureParentDir(path);
  appendFileSync(path, content, "utf-8");
}

export function readJsonFile<T>(
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  opts: {
    defaultValue: T;
    corruptedCode: string;
    corruptedMessage: string;
  },
): T {
  if (!existsSync(path)) return opts.defaultValue;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    return schema.parse(raw);
  } catch {
    throw new ServiceError(opts.corruptedMessage, opts.corruptedCode);
  }
}

export function snapshotFiles(paths: ReadonlyArray<string>): FileSnapshot[] {
  return [...new Set(paths)].map((path) => ({
    path,
    existed: existsSync(path),
    content: existsSync(path) ? readFileSync(path) : undefined,
  }));
}

export function restoreFileSnapshots(snapshots: ReadonlyArray<FileSnapshot>): void {
  for (const snapshot of snapshots) {
    if (!snapshot.existed) {
      rmSync(snapshot.path, { force: true });
      continue;
    }
    ensureParentDir(snapshot.path);
    writeFileSync(snapshot.path, snapshot.content ?? Buffer.from(""));
  }
}

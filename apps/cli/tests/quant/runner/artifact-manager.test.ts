import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import {
  createAutoresearchRunDir,
  createQuantArtifactDir,
  listArtifacts,
  normalizeArtifacts,
  writeArtifactJson,
  writeArtifactText,
} from "../../../src/quant/runner/artifact-manager.js";

const TEST_DIR = `/tmp/tonquant-test-artifacts-${Date.now()}`;

afterAll(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe("artifact-manager", () => {
  test("createQuantArtifactDir creates nested directory", () => {
    const dir = createQuantArtifactDir("data-fetch", "test-run-1", TEST_DIR);
    expect(existsSync(dir)).toBe(true);
    expect(dir).toContain("data-fetch");
    expect(dir).toContain("test-run-1");
  });

  test("writeArtifactJson writes valid JSON", () => {
    const dir = createQuantArtifactDir("factors", "test-run-2", TEST_DIR);
    writeArtifactJson(dir, "result.json", { key: "value" });
    const content = readFileSync(`${dir}/result.json`, "utf-8");
    expect(JSON.parse(content)).toEqual({ key: "value" });
  });

  test("writeArtifactText writes text content", () => {
    const dir = createQuantArtifactDir("factors", "test-run-3", TEST_DIR);
    writeArtifactText(dir, "run.log", "hello world");
    const content = readFileSync(`${dir}/run.log`, "utf-8");
    expect(content).toBe("hello world");
  });

  test("listArtifacts discovers files recursively", () => {
    const dir = createQuantArtifactDir("backtests", "test-run-4", TEST_DIR);
    writeArtifactJson(dir, "request.json", {});
    writeArtifactText(dir, "run.log", "log");
    const artifacts = listArtifacts(dir);
    expect(artifacts.length).toBe(2);
    expect(artifacts.some((a) => a.kind === "json")).toBe(true);
    expect(artifacts.some((a) => a.kind === "log")).toBe(true);
  });

  test("normalizeArtifacts resolves relative paths", () => {
    const dir = "/some/dir";
    const artifacts = normalizeArtifacts(dir, [
      { path: "result.json", kind: "json" },
      { path: "/absolute/path.csv", kind: "dataset" },
    ]);
    expect(artifacts[0]?.path).toBe("/some/dir/result.json");
    expect(artifacts[1]?.path).toBe("/absolute/path.csv");
  });

  test("listArtifacts returns empty for nonexistent dir", () => {
    const artifacts = listArtifacts("/nonexistent/path");
    expect(artifacts).toEqual([]);
  });

  test("rejects path traversal in artifact identifiers", () => {
    expect(() => createQuantArtifactDir("data-fetch", "../escape", TEST_DIR)).toThrow(
      "filesystem-safe identifier",
    );
    expect(() => createAutoresearchRunDir("../../escape", TEST_DIR)).toThrow(
      "filesystem-safe identifier",
    );
  });
});

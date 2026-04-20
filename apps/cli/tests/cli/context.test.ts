import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadOrCreateKey, saveConfig } from "@tonquant/core";
import { buildContextSnapshot } from "../../src/cli/context.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("context command snapshot", () => {
  test("builds a bounded local snapshot from explicit local paths", async () => {
    const root = mkdtempSync(join(tmpdir(), "tonquant-context-"));
    tempDirs.push(root);

    const configPath = join(root, "config", "wallet.json");
    const quantRoot = join(root, "quant");
    const platformDbPath = join(root, "platform", "platform.sqlite");

    await saveConfig(
      {
        network: "testnet",
        wallet: {
          mnemonic_encrypted: "ciphertext",
          address: "UQ_ctx_wallet",
          version: "v5r1",
        },
        preferences: {
          default_slippage: 0.01,
          default_dex: "stonfi",
          currency: "usd",
        },
      },
      { configPath },
    );
    await loadOrCreateKey({ configPath });

    mkdirSync(join(quantRoot, "data-fetch"), { recursive: true });
    writeFileSync(join(quantRoot, "data-fetch", "latest.dataset.json"), "{}\n", "utf-8");

    mkdirSync(dirname(platformDbPath), { recursive: true });
    const db = new Database(platformDbPath);
    try {
      db.exec(`
        CREATE TABLE signing_sessions (
          session_id TEXT PRIMARY KEY,
          factor_slug TEXT NOT NULL,
          factor_version TEXT,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT,
          publisher_address TEXT,
          payout_address TEXT,
          network TEXT,
          audience TEXT,
          nonce TEXT,
          intent_json TEXT,
          intent_text TEXT,
          manifest_json TEXT,
          manifest_sha256 TEXT,
          sign_url TEXT,
          expires_at TEXT,
          completed_at TEXT,
          publication_id TEXT
        );
        CREATE TABLE publications (
          publication_id TEXT PRIMARY KEY,
          action TEXT NOT NULL,
          factor_slug TEXT NOT NULL,
          factor_version TEXT NOT NULL,
          publisher_address TEXT NOT NULL,
          payout_address TEXT NOT NULL,
          manifest_json TEXT NOT NULL,
          manifest_sha256 TEXT NOT NULL,
          intent_json TEXT NOT NULL,
          status TEXT NOT NULL,
          rejection_reason TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          signed_at TEXT NOT NULL
        );
      `);
      db.query(
        `INSERT INTO signing_sessions (
          session_id, factor_slug, factor_version, status, created_at, updated_at,
          publisher_address, payout_address, network, audience, nonce,
          intent_json, intent_text, manifest_json, manifest_sha256, sign_url, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "sess_ctx_1",
        "ton_signal_alpha",
        "1.0.0",
        "pending",
        "2026-04-16T16:00:00.000Z",
        "2026-04-16T16:01:00.000Z",
        "0:pub",
        "0:payout",
        "testnet",
        "https://publish.tonquant.test",
        "nonce",
        "{}",
        "{}",
        "{}",
        "abc",
        "https://publish.tonquant.test/sign?session=sess_ctx_1",
        "2026-04-16T16:10:00.000Z",
      );
      db.query(
        `INSERT INTO publications (
          publication_id, action, factor_slug, factor_version, publisher_address, payout_address,
          manifest_json, manifest_sha256, intent_json, status, rejection_reason,
          created_at, updated_at, signed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "pub_ctx_1",
        "publish_factor",
        "ton_signal_alpha",
        "1.0.0",
        "0:pub",
        "0:payout",
        "{}",
        "abc",
        "{}",
        "pending_review",
        null,
        "2026-04-16T16:02:00.000Z",
        "2026-04-16T16:03:00.000Z",
        "2026-04-16T16:02:30.000Z",
      );
    } finally {
      db.close();
    }

    const snapshot = await buildContextSnapshot({
      configPath,
      quantRoot,
      platformDbPath,
      cwd: "/tmp/agent",
      now: "2026-04-16T16:05:00.000Z",
      loaders: {
        listFactors: () => [],
        listReports: () => [],
        listAutomationJobs: () => [],
        listTracks: () => ({
          runId: "list-ctx",
          status: "completed",
          summary: "0 track(s) found.",
          artifacts: [],
          tracks: [],
        }),
      },
    });

    expect(snapshot.config.path).toBe(configPath);
    expect(snapshot.config.walletAddress).toBe("UQ_ctx_wallet");
    expect(snapshot.config.keyfileExists).toBe(true);
    expect(snapshot.signingSessions.total).toBe(1);
    expect(snapshot.publications.total).toBe(1);
    expect(snapshot.artifacts.total).toBe(1);
    expect(snapshot.capabilities.some((entry) => entry.name === "context --json")).toBe(true);
  });

  test("handles an empty local workspace", async () => {
    const root = mkdtempSync(join(tmpdir(), "tonquant-context-empty-"));
    tempDirs.push(root);

    const snapshot = await buildContextSnapshot({
      configPath: join(root, "config", "missing.json"),
      quantRoot: join(root, "quant"),
      platformDbPath: join(root, "platform", "platform.sqlite"),
      loaders: {
        listFactors: () => [],
        listReports: () => [],
        listAutomationJobs: () => [],
        listTracks: () => ({
          runId: "list-empty",
          status: "completed",
          summary: "0 track(s) found.",
          artifacts: [],
          tracks: [],
        }),
      },
    });

    expect(snapshot.config.exists).toBe(false);
    expect(snapshot.config.network).toBeNull();
    expect(snapshot.artifacts.total).toBe(0);
    expect(snapshot.signingSessions.total).toBe(0);
    expect(snapshot.publications.total).toBe(0);
  });
});

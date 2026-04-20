import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readEvents } from "@tonquant/core";
import {
  getTrack,
  initTrack,
  listTracks,
  promoteCandidate,
  rejectCandidate,
  runTrack,
} from "../../../src/quant/autoresearch/index.js";

let outputDir: string;
let previousEventLogPath: string | undefined;

function createTrack(title: string, strategy = "momentum") {
  return initTrack({
    title,
    strategy,
    symbols: ["TON/USDT"],
    startDate: "2024-01-01",
    endDate: "2024-03-31",
    outputDir,
  });
}

beforeEach(() => {
  outputDir = mkdtempSync(join(tmpdir(), "tonquant-autoresearch-"));
  previousEventLogPath = process.env.TONQUANT_EVENT_LOG_PATH;
  process.env.TONQUANT_EVENT_LOG_PATH = join(outputDir, "events.jsonl");
  delete process.env.TONQUANT_EVENT_LOG_FAIL_APPEND;
});

afterEach(() => {
  if (previousEventLogPath === undefined) {
    delete process.env.TONQUANT_EVENT_LOG_PATH;
  } else {
    process.env.TONQUANT_EVENT_LOG_PATH = previousEventLogPath;
  }
  delete process.env.TONQUANT_EVENT_LOG_FAIL_APPEND;
  rmSync(outputDir, { recursive: true, force: true });
});

describe("autoresearch lifecycle service", () => {
  test("init creates durable baseline, state, and history", async () => {
    const result = await createTrack("Momentum Daily");

    expect(result.baseline.trackId).toBeDefined();
    expect(result.state.status).toBe("idle");
    expect(result.history).toHaveLength(1);
    expect(result.candidates).toHaveLength(0);

    const hydrated = getTrack({
      trackId: result.baseline.trackId,
      outputDir,
    });
    expect(hydrated.baseline.title).toBe("Momentum Daily");
    expect(hydrated.history[0]?.eventType).toBe("autoresearch.init");
    expect(readEvents({ type: "autoresearch.init" })).toHaveLength(1);
  });

  test("rejects path traversal in track and candidate identifiers", async () => {
    await expect(
      initTrack({
        trackId: "../escape",
        title: "Bad Track",
        strategy: "momentum",
        symbols: ["TON/USDT"],
        startDate: "2024-01-01",
        endDate: "2024-03-31",
        outputDir,
      }),
    ).rejects.toThrow("filesystem-safe identifier");

    const track = await createTrack("Safe Track");
    await expect(
      rejectCandidate({
        trackId: track.baseline.trackId,
        candidateId: "../escape",
        outputDir,
      }),
    ).rejects.toThrow("filesystem-safe identifier");
  });

  test("load-time baseline validation rejects unsupported provider contracts", async () => {
    const track = await createTrack("Invalid Provider Reload");
    const baselineFile = join(
      outputDir,
      "quant",
      "autoresearch",
      track.baseline.trackId,
      "baseline.json",
    );
    const baseline = JSON.parse(readFileSync(baselineFile, "utf-8")) as Record<string, unknown>;
    writeFileSync(
      baselineFile,
      `${JSON.stringify({ ...baseline, provider: "yfinance" }, null, 2)}\n`,
      "utf-8",
    );

    expect(() =>
      getTrack({
        trackId: track.baseline.trackId,
        outputDir,
      }),
    ).toThrow("Unsupported provider 'yfinance' for market 'crypto/ton'.");
  });

  test("run persists candidates, history, and latest run summary", async () => {
    const track = await createTrack("Track Run Success");
    const result = await runTrack({
      trackId: track.baseline.trackId,
      iterations: 1,
      outputDir,
    });

    expect(result.status).toBe("pending-review");
    expect(result.state.latestRun?.status).toBe("completed");
    expect(result.state.latestRun?.iterationsCompleted).toBe(1);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.status).toBe("pending-review");
    expect(result.history.map((entry) => entry.eventType)).toEqual([
      "autoresearch.init",
      "autoresearch.run.start",
      "autoresearch.run.complete",
    ]);
    expect(readEvents({ type: "autoresearch.run.start" })).toHaveLength(1);
    expect(readEvents({ type: "autoresearch.run.complete" })).toHaveLength(1);
  });

  test("list aggregates pending candidates from persisted tracks", async () => {
    const first = await createTrack("Track One");
    await createTrack("Track Two");
    await runTrack({
      trackId: first.baseline.trackId,
      iterations: 1,
      outputDir,
    });

    const result = listTracks({ outputDir });
    const firstSummary = result.tracks.find((track) => track.trackId === first.baseline.trackId);

    expect(result.tracks).toHaveLength(2);
    expect(firstSummary?.candidateCount).toBe(1);
    expect(firstSummary?.pendingPromotionCount).toBe(1);
  });

  test("failed runs block the track and persist failure history", async () => {
    const track = await createTrack("Broken Strategy", "not-supported");
    const result = await runTrack({
      trackId: track.baseline.trackId,
      iterations: 1,
      outputDir,
    });

    expect(result.status).toBe("blocked");
    expect(result.state.latestRun?.status).toBe("failed");
    expect(result.state.latestRun?.iterationsCompleted).toBe(0);
    expect(result.candidates).toHaveLength(0);
    expect(result.history.at(-1)?.eventType).toBe("autoresearch.run.fail");
    expect(readEvents({ type: "autoresearch.run.fail" })).toHaveLength(1);
  });

  test("blocked tracks can be retried after fixing the underlying issue", async () => {
    const track = await createTrack("Retryable Track", "not-supported");
    const failed = await runTrack({
      trackId: track.baseline.trackId,
      iterations: 1,
      outputDir,
    });

    expect(failed.status).toBe("blocked");

    const baselineFile = join(
      outputDir,
      "quant",
      "autoresearch",
      track.baseline.trackId,
      "baseline.json",
    );
    const baseline = JSON.parse(readFileSync(baselineFile, "utf-8")) as Record<string, unknown>;
    writeFileSync(
      baselineFile,
      `${JSON.stringify({ ...baseline, strategy: "momentum" }, null, 2)}\n`,
      "utf-8",
    );

    const retried = await runTrack({
      trackId: track.baseline.trackId,
      iterations: 1,
      outputDir,
    });

    expect(retried.status).toBe("pending-review");
    expect(retried.state.latestRun?.status).toBe("completed");
    expect(retried.candidates).toHaveLength(1);
  });

  test("promote and reject enforce review transitions", async () => {
    const track = await createTrack("Review Loop");
    const runResult = await runTrack({
      trackId: track.baseline.trackId,
      iterations: 2,
      outputDir,
    });
    const firstCandidate = runResult.candidates[0];
    const secondCandidate = runResult.candidates[1];

    expect(firstCandidate).toBeDefined();
    expect(secondCandidate).toBeDefined();
    if (!firstCandidate || !secondCandidate) {
      throw new Error("Expected two autoresearch candidates.");
    }

    const rejected = await rejectCandidate({
      trackId: track.baseline.trackId,
      candidateId: firstCandidate.candidateId,
      outputDir,
    });
    const promoted = await promoteCandidate({
      trackId: track.baseline.trackId,
      candidateId: secondCandidate.candidateId,
      outputDir,
    });

    expect(
      rejected.candidates.find((candidate) => candidate.candidateId === firstCandidate.candidateId)
        ?.status,
    ).toBe("rejected");
    expect(promoted.state.bestCandidateId).toBe(secondCandidate.candidateId);
    expect(promoted.baseline.baselineRunId).toBe(secondCandidate.candidateId);
    expect(promoted.status).toBe("idle");
    expect(readEvents({ type: "autoresearch.reject" })).toHaveLength(1);
    expect(readEvents({ type: "autoresearch.promote" })).toHaveLength(1);

    await expect(
      rejectCandidate({
        trackId: track.baseline.trackId,
        candidateId: secondCandidate.candidateId,
        outputDir,
      }),
    ).rejects.toThrow("cannot be rejected");
  });
});

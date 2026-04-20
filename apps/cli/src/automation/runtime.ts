import { randomUUID } from "node:crypto";
import {
  type AutomationActor,
  AutomationHandlerRegistry,
  type AutomationHandlerResult,
  type AutomationJobSpec,
  type AutomationRunRecord,
  acquireAutomationDaemonLock,
  claimAutomationJob,
  claimNextDueAutomationJob,
  completeAutomationJob,
  evaluateAlerts,
  failAutomationJob,
  getAutomationJob,
  recoverExpiredAutomationJobs,
  type ScheduleAutomationRequest,
  ServiceError,
  scheduleAutomationJob,
} from "@tonquant/core";
import { runAutoresearchTrack } from "../quant/api/autoresearch.js";
import {
  createQuantArtifactDir,
  writeArtifactJson,
  writeArtifactText,
} from "../quant/runner/artifact-manager.js";
import { fetchPublicationStatus, resolvePlatformUrl } from "./platform-client.js";

type ClaimedAutomationJob = ReturnType<typeof claimAutomationJob>;

function createActor(kind: AutomationActor["kind"], id: string): AutomationActor {
  return {
    kind,
    id,
    requestId: randomUUID(),
  };
}

function outputDirForSpec(spec: AutomationJobSpec): string | undefined {
  if (spec.kind === "autoresearch.track.run") {
    return spec.params.outputDir;
  }
  return undefined;
}

function summarizeAutoresearchResult(
  spec: Extract<AutomationJobSpec, { kind: "autoresearch.track.run" }>,
  result: Awaited<ReturnType<typeof runAutoresearchTrack>>,
): AutomationHandlerResult {
  const latestRunId = result.state.latestRun?.runId ?? "n/a";
  return {
    summary: `Ran autoresearch track ${spec.params.trackId}; latest run ${latestRunId}.`,
    payload: {
      trackId: spec.params.trackId,
      status: result.status,
      candidateCount: result.candidates.length,
      latestRunId,
    },
    artifactPaths: result.artifacts.map((artifact) => artifact.path),
  };
}

function summarizeAlertEvaluation(
  spec: Extract<AutomationJobSpec, { kind: "factor.alert.evaluate" }>,
): AutomationHandlerResult {
  const evaluations = evaluateAlerts({ factorId: spec.params.factorId });
  const fired = evaluations.filter((item) => item.status === "fired").length;
  const skipped = evaluations.filter((item) => item.status === "not-triggered").length;
  const failed = evaluations.filter((item) => item.status === "failed").length;
  const scope = spec.params.factorId ?? "all factors";
  return {
    summary: `Evaluated alerts for ${scope}; fired=${fired}, notTriggered=${skipped}, failed=${failed}.`,
    payload: {
      factorId: spec.params.factorId ?? null,
      fired,
      notTriggered: skipped,
      failed,
      evaluations,
    },
  };
}

async function summarizePublicationCheck(
  spec: Extract<AutomationJobSpec, { kind: "publish.submission.check" }>,
): Promise<AutomationHandlerResult> {
  const status = await fetchPublicationStatus({
    platformUrl: resolvePlatformUrl(spec.params.platformUrl),
    publicationId: spec.params.publicationId,
  });

  if (status.publication.status === "rejected") {
    throw new ServiceError(
      status.publication.rejectionReason ??
        `Publication ${spec.params.publicationId} was rejected.`,
      "AUTOMATION_PUBLICATION_REJECTED",
    );
  }

  return {
    summary: `Checked publication ${spec.params.publicationId}; status=${status.publication.status}.`,
    payload: {
      publicationId: spec.params.publicationId,
      status: status.publication.status,
      activeVersion: status.activeVersion ?? null,
      rejectionReason: status.publication.rejectionReason ?? null,
    },
  };
}

export function createAutomationHandlerRegistry(): AutomationHandlerRegistry {
  const registry = new AutomationHandlerRegistry();

  registry.register("autoresearch.track.run", async (spec) => {
    if (spec.kind !== "autoresearch.track.run") {
      throw new ServiceError("Automation handler kind mismatch.", "AUTOMATION_HANDLER_INVALID");
    }
    return summarizeAutoresearchResult(
      spec,
      await runAutoresearchTrack({
        trackId: spec.params.trackId,
        iterations: spec.params.iterations,
        outputDir: spec.params.outputDir,
      }),
    );
  });

  registry.register("factor.alert.evaluate", async (spec) => {
    if (spec.kind !== "factor.alert.evaluate") {
      throw new ServiceError("Automation handler kind mismatch.", "AUTOMATION_HANDLER_INVALID");
    }
    return summarizeAlertEvaluation(spec);
  });

  registry.register("publish.submission.check", async (spec) => {
    if (spec.kind !== "publish.submission.check") {
      throw new ServiceError("Automation handler kind mismatch.", "AUTOMATION_HANDLER_INVALID");
    }
    return summarizePublicationCheck(spec);
  });

  return registry;
}

function writeRunRecordArtifact(
  spec: AutomationJobSpec,
  runId: string,
  record: AutomationRunRecord,
): string {
  const artifactDir = createQuantArtifactDir("automation-runs", runId, outputDirForSpec(spec));
  writeArtifactJson(artifactDir, "result.json", record);
  return `${artifactDir}/result.json`;
}

function createArtifactPaths(
  spec: AutomationJobSpec,
  runId: string,
  handlerArtifactPaths: string[] = [],
): { artifactDir: string; artifactPaths: string[] } {
  const artifactDir = createQuantArtifactDir("automation-runs", runId, outputDirForSpec(spec));
  const artifactPaths = new Set<string>(handlerArtifactPaths);
  artifactPaths.add(`${artifactDir}/request.json`);
  artifactPaths.add(`${artifactDir}/run.log`);
  artifactPaths.add(`${artifactDir}/result.json`);
  return { artifactDir, artifactPaths: [...artifactPaths] };
}

export async function executeAutomationJob(
  claimed: ClaimedAutomationJob,
  params: {
    actor: AutomationActor;
    registry?: AutomationHandlerRegistry;
  },
): Promise<AutomationRunRecord> {
  const registry = params.registry ?? createAutomationHandlerRegistry();
  const startedAt = claimed.state.lastStartedAt ?? new Date().toISOString();
  const { artifactDir } = createArtifactPaths(claimed.spec, claimed.runId);

  writeArtifactJson(artifactDir, "request.json", {
    jobId: claimed.spec.jobId,
    runId: claimed.runId,
    kind: claimed.spec.kind,
    executionKey: claimed.spec.executionKey,
    schedule: claimed.spec.schedule,
    params: claimed.spec.params,
    actor: params.actor,
    startedAt,
  });

  try {
    const handler = registry.get(claimed.spec.kind);
    const result = await handler(claimed.spec, {
      actor: params.actor,
      runId: claimed.runId,
    });
    const finishedAt = new Date().toISOString();
    const { artifactPaths } = createArtifactPaths(
      claimed.spec,
      claimed.runId,
      result.artifactPaths,
    );
    const record: AutomationRunRecord = {
      jobId: claimed.spec.jobId,
      runId: claimed.runId,
      kind: claimed.spec.kind,
      executionKey: claimed.spec.executionKey,
      actor: params.actor,
      status: "completed",
      startedAt,
      finishedAt,
      summary: result.summary,
      payload: result.payload,
      artifactPaths,
    };
    writeArtifactText(
      artifactDir,
      "run.log",
      `status=completed\njobId=${claimed.spec.jobId}\nrunId=${claimed.runId}\nsummary=${result.summary}\n`,
    );
    writeRunRecordArtifact(claimed.spec, claimed.runId, record);
    completeAutomationJob(record);
    return record;
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof ServiceError ? error.code : "AUTOMATION_RUN_FAILED";
    const { artifactPaths } = createArtifactPaths(claimed.spec, claimed.runId);
    const record: AutomationRunRecord = {
      jobId: claimed.spec.jobId,
      runId: claimed.runId,
      kind: claimed.spec.kind,
      executionKey: claimed.spec.executionKey,
      actor: params.actor,
      status: "failed",
      startedAt,
      finishedAt,
      summary: `Automation job ${claimed.spec.jobId} failed.`,
      error: message,
      errorCode: code,
      artifactPaths,
    };
    writeArtifactText(
      artifactDir,
      "run.log",
      `status=failed\njobId=${claimed.spec.jobId}\nrunId=${claimed.runId}\nerror=${message}\ncode=${code}\n`,
    );
    writeRunRecordArtifact(claimed.spec, claimed.runId, record);
    failAutomationJob(record);
    throw error;
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(new ServiceError("Automation daemon interrupted.", "AUTOMATION_DAEMON_ABORTED"));
    };

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function runAutomationJobNow(params: {
  jobId?: string;
  request?: ScheduleAutomationRequest;
  actorId?: string;
  registry?: AutomationHandlerRegistry;
}): Promise<{ jobId: string; record: AutomationRunRecord; persisted: boolean }> {
  const actor = createActor("manual", params.actorId ?? `cli:${process.pid}`);
  let jobId = params.jobId;
  let persisted = true;

  if (!jobId) {
    if (!params.request) {
      throw new ServiceError(
        "run-now requires either an existing jobId or a schedule request.",
        "AUTOMATION_RUNNOW_INVALID",
      );
    }
    const summary = scheduleAutomationJob({
      ...params.request,
      actor,
      schedule: {
        kind: "at",
        at: new Date(Date.now() + 1).toISOString(),
      },
    });
    jobId = summary.jobId;
    persisted = false;
  }

  const claimed = claimAutomationJob(jobId, {
    ownerId: actor.id,
    actor,
  });
  const record = await executeAutomationJob(claimed, {
    actor,
    registry: params.registry,
  });
  return { jobId, record, persisted };
}

export interface AutomationDaemonResult {
  ownerId: string;
  recoveredJobIds: string[];
  executedJobIds: string[];
  failedJobIds: string[];
}

export async function runAutomationDaemon(
  params: {
    ownerId?: string;
    once?: boolean;
    pollIntervalMs?: number;
    signal?: AbortSignal;
    registry?: AutomationHandlerRegistry;
  } = {},
): Promise<AutomationDaemonResult> {
  const ownerId = params.ownerId ?? `daemon:${process.pid}`;
  const pollIntervalMs = params.pollIntervalMs ?? 1000;
  const actor = createActor("daemon", ownerId);
  const registry = params.registry ?? createAutomationHandlerRegistry();
  const lock = acquireAutomationDaemonLock(ownerId);
  const recovered = recoverExpiredAutomationJobs().map((job) => job.jobId);
  const executedJobIds: string[] = [];
  const failedJobIds: string[] = [];

  try {
    for (;;) {
      if (params.signal?.aborted) {
        break;
      }

      const claimed = claimNextDueAutomationJob({
        ownerId,
        actor,
        now: new Date(),
      });

      if (!claimed) {
        if (params.once) {
          break;
        }
        try {
          await sleep(pollIntervalMs, params.signal);
        } catch (error) {
          if (error instanceof ServiceError && error.code === "AUTOMATION_DAEMON_ABORTED") {
            break;
          }
          throw error;
        }
        continue;
      }

      try {
        await executeAutomationJob(claimed, { actor, registry });
        executedJobIds.push(claimed.spec.jobId);
      } catch {
        failedJobIds.push(claimed.spec.jobId);
      }

      if (params.once) {
        break;
      }
    }
  } finally {
    lock.release();
  }

  return {
    ownerId,
    recoveredJobIds: recovered,
    executedJobIds,
    failedJobIds,
  };
}

export function readAutomationJobDetail(jobId: string) {
  return getAutomationJob(jobId);
}

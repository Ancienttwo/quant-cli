import type { AutomationJobSummary, ScheduleAutomationRequest } from "@tonquant/core";
import {
  listAutomationJobs,
  pauseAutomationJob,
  removeAutomationJob,
  resumeAutomationJob,
  scheduleAutomationJob,
} from "@tonquant/core";
import type { Command } from "commander";
import {
  readAutomationJobDetail,
  runAutomationDaemon,
  runAutomationJobNow,
} from "../automation/runtime.js";
import {
  formatAutomationDaemonResult,
  formatAutomationJobDetail,
  formatAutomationJobList,
  formatAutomationRunResult,
} from "../utils/format-automation.js";
import { CliCommandError, handleCommand } from "../utils/output.js";

interface AutomationCommandOptions {
  json?: boolean;
}

interface AutomationScheduleOptions {
  kind?: string;
  every?: string;
  at?: string;
  track?: string;
  iterations?: string;
  factor?: string;
  publication?: string;
  platformUrl?: string;
  jobId?: string;
}

interface AutomationRunNowOptions extends Omit<AutomationScheduleOptions, "every" | "at"> {
  job?: string;
}

function parseSchedule(schedule: {
  every?: string;
  at?: string;
}): ScheduleAutomationRequest["schedule"] {
  if (schedule.every && schedule.at) {
    throw new CliCommandError(
      "Use either --every or --at, not both.",
      "AUTOMATION_SCHEDULE_INVALID",
    );
  }
  if (!schedule.every && !schedule.at) {
    throw new CliCommandError("One of --every or --at is required.", "AUTOMATION_SCHEDULE_INVALID");
  }
  if (schedule.every) {
    return { kind: "every", every: schedule.every };
  }
  return {
    kind: "at",
    at: schedule.at === "now" ? new Date().toISOString() : String(schedule.at),
  };
}

function buildRequestFromOptions(
  opts: AutomationScheduleOptions,
  actor: ScheduleAutomationRequest["actor"],
): ScheduleAutomationRequest {
  if (!opts.kind) {
    throw new CliCommandError("--kind is required.", "AUTOMATION_KIND_REQUIRED");
  }

  const schedule = parseSchedule({ every: opts.every, at: opts.at });

  switch (opts.kind) {
    case "autoresearch.track.run":
      if (!opts.track) {
        throw new CliCommandError(
          "--track is required for autoresearch.track.run.",
          "AUTOMATION_PARAMS_INVALID",
        );
      }
      return {
        kind: "autoresearch.track.run",
        params: {
          trackId: opts.track,
          iterations: Number.parseInt(opts.iterations ?? "1", 10),
        },
        schedule,
        actor,
        jobId: opts.jobId,
      };
    case "factor.alert.evaluate":
      return {
        kind: "factor.alert.evaluate",
        params: {
          factorId: opts.factor,
        },
        schedule,
        actor,
        jobId: opts.jobId,
      };
    case "publish.submission.check":
      if (!opts.publication) {
        throw new CliCommandError(
          "--publication is required for publish.submission.check.",
          "AUTOMATION_PARAMS_INVALID",
        );
      }
      return {
        kind: "publish.submission.check",
        params: {
          publicationId: opts.publication,
          platformUrl: opts.platformUrl,
        },
        schedule,
        actor,
        jobId: opts.jobId,
      };
    default:
      throw new CliCommandError(
        `Unsupported automation kind '${opts.kind}'.`,
        "AUTOMATION_KIND_INVALID",
      );
  }
}

function sortJobs(jobs: AutomationJobSummary[]): AutomationJobSummary[] {
  return [...jobs].sort((left, right) => left.jobId.localeCompare(right.jobId));
}

function attachAbortController(): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return {
    signal: controller.signal,
    cleanup: () => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
    },
  };
}

export function registerAutomationCommand(program: Command): void {
  const automation = program.command("automation").description("Automation jobs and control plane");
  const manualActor: ScheduleAutomationRequest["actor"] = {
    kind: "manual",
    id: `cli:${process.pid}`,
  };

  automation
    .command("schedule")
    .description("Schedule an automation job")
    .requiredOption("--kind <kind>", "Job kind")
    .option("--every <interval>", "Repeat interval such as 30m or 1h")
    .option("--at <timestamp>", "Run once at an ISO timestamp or 'now'")
    .option("--track <trackId>", "Autoresearch track id")
    .option("--iterations <count>", "Autoresearch iteration count", "1")
    .option("--factor <factorId>", "Optional factor id for alert evaluation")
    .option("--publication <publicationId>", "Publication id for submission checks")
    .option("--platform-url <url>", "Platform API origin for submission checks")
    .option("--job-id <jobId>", "Optional explicit automation job id")
    .action(async (opts: AutomationScheduleOptions) => {
      const json = program.opts().json ?? false;
      await handleCommand(
        { json },
        async () => scheduleAutomationJob(buildRequestFromOptions(opts, manualActor)),
        (job) => formatAutomationJobList([job]),
      );
    });

  automation
    .command("list")
    .description("List automation jobs")
    .action(async () => {
      const json = program.opts().json ?? false;
      await handleCommand(
        { json },
        async () => sortJobs(listAutomationJobs()),
        formatAutomationJobList,
      );
    });

  automation
    .command("status <jobId>")
    .description("Show automation job detail")
    .action(async (jobId: string) => {
      const json = program.opts().json ?? false;
      await handleCommand(
        { json },
        async () => readAutomationJobDetail(jobId),
        formatAutomationJobDetail,
      );
    });

  automation
    .command("pause <jobId>")
    .description("Pause an automation job")
    .action(async (jobId: string) => {
      const json = program.opts().json ?? false;
      await handleCommand(
        { json },
        async () => pauseAutomationJob(jobId),
        (job) => formatAutomationJobList([job]),
      );
    });

  automation
    .command("resume <jobId>")
    .description("Resume an automation job")
    .action(async (jobId: string) => {
      const json = program.opts().json ?? false;
      await handleCommand(
        { json },
        async () => resumeAutomationJob(jobId),
        (job) => formatAutomationJobList([job]),
      );
    });

  automation
    .command("remove <jobId>")
    .description("Remove an automation job")
    .action(async (jobId: string) => {
      const json = program.opts().json ?? false;
      await handleCommand(
        { json },
        async () => ({ jobId, removed: removeAutomationJob(jobId) }),
        (result) =>
          result.removed
            ? `Removed automation job ${result.jobId}`
            : `Automation job ${result.jobId} not found`,
      );
    });

  automation
    .command("run-now")
    .description("Run an automation job immediately")
    .option("--job <jobId>", "Existing automation job id")
    .option("--kind <kind>", "Ad-hoc job kind when --job is not provided")
    .option("--track <trackId>", "Autoresearch track id")
    .option("--iterations <count>", "Autoresearch iteration count", "1")
    .option("--factor <factorId>", "Optional factor id for alert evaluation")
    .option("--publication <publicationId>", "Publication id for submission checks")
    .option("--platform-url <url>", "Platform API origin for submission checks")
    .action(async (opts: AutomationRunNowOptions) => {
      const json = program.opts().json ?? false;
      await handleCommand(
        { json },
        async () => {
          if (opts.job) {
            return runAutomationJobNow({ jobId: opts.job });
          }

          return runAutomationJobNow({
            request: buildRequestFromOptions(
              {
                ...opts,
                at: "now",
              },
              manualActor,
            ),
          });
        },
        formatAutomationRunResult,
      );
    });
}

export function registerDaemonCommand(program: Command): void {
  program
    .command("daemon")
    .description("Run the foreground automation daemon")
    .option("--once", "Run at most one due job and exit")
    .option("--owner <ownerId>", "Explicit daemon owner id")
    .option("--poll-interval-ms <ms>", "Idle poll interval in milliseconds", "1000")
    .action(async (opts: { once?: boolean; owner?: string; pollIntervalMs?: string }) => {
      const json = (program.opts() as AutomationCommandOptions).json ?? false;
      const { signal, cleanup } = attachAbortController();
      try {
        await handleCommand(
          { json },
          async () =>
            runAutomationDaemon({
              ownerId: opts.owner,
              once: Boolean(opts.once),
              pollIntervalMs: Number.parseInt(opts.pollIntervalMs ?? "1000", 10),
              signal,
            }),
          formatAutomationDaemonResult,
        );
      } finally {
        cleanup();
      }
    });
}

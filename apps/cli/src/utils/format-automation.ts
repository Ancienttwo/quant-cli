import type {
  AutomationJobDetail,
  AutomationJobSummary,
  AutomationRunRecord,
} from "@tonquant/core";
import chalk from "chalk";
import Table from "cli-table3";
import type { AutomationDaemonResult } from "../automation/runtime.js";
import { divider, header, label } from "./format-helpers.js";

export function formatAutomationJobList(jobs: AutomationJobSummary[]): string {
  if (jobs.length === 0) {
    return `\n${header("Automation Jobs")}\n${divider()}\n  ${chalk.dim("No automation jobs scheduled.")}\n`;
  }

  const table = new Table({
    head: ["Job", "Kind", "Status", "Next Run", "Failures"],
    style: { head: ["cyan"] },
  });

  for (const job of jobs) {
    table.push([
      chalk.cyan(job.jobId),
      job.kind,
      job.status,
      job.nextRunAt ?? chalk.dim("n/a"),
      String(job.consecutiveFailures),
    ]);
  }

  return `\n${header("Automation Jobs")}\n${divider()}\n${table.toString()}\n`;
}

export function formatAutomationJobDetail(detail: AutomationJobDetail): string {
  const lines = [
    "",
    header(`Automation Job: ${detail.spec.jobId}`),
    divider(),
    `  ${label("Kind:")} ${chalk.cyan(detail.spec.kind)}`,
    `  ${label("Status:")} ${chalk.cyan(detail.state.status)}`,
    `  ${label("Execution Key:")} ${chalk.cyan(detail.spec.executionKey)}`,
    `  ${label("Next Run:")} ${chalk.cyan(detail.state.nextRunAt ?? "n/a")}`,
    `  ${label("Last Run:")} ${chalk.cyan(detail.state.lastRunId ?? "n/a")}`,
    `  ${label("Failures:")} ${chalk.cyan(String(detail.state.consecutiveFailures))}`,
  ];

  if (detail.state.lastError) {
    lines.push(`  ${label("Last Error:")} ${chalk.red(detail.state.lastError)}`);
  }

  if (detail.history.length > 0) {
    const recent = detail.history.slice(-5).reverse();
    const table = new Table({
      head: ["Run", "Status", "Finished", "Summary"],
      style: { head: ["cyan"] },
    });
    for (const entry of recent) {
      table.push([entry.runId, entry.status, entry.finishedAt, entry.summary]);
    }
    lines.push("", table.toString());
  }

  lines.push("");
  return lines.join("\n");
}

export function formatAutomationRunResult(data: {
  jobId: string;
  record: AutomationRunRecord;
  persisted: boolean;
}): string {
  return [
    "",
    header("Automation Run"),
    divider(),
    `  ${label("Job:")} ${chalk.cyan(data.jobId)}`,
    `  ${label("Run:")} ${chalk.cyan(data.record.runId)}`,
    `  ${label("Status:")} ${chalk.cyan(data.record.status)}`,
    `  ${label("Persisted Job:")} ${chalk.cyan(data.persisted ? "yes" : "ad-hoc")}`,
    `  ${label("Summary:")} ${data.record.summary}`,
    "",
  ].join("\n");
}

export function formatAutomationDaemonResult(data: AutomationDaemonResult): string {
  return [
    "",
    header("Automation Daemon"),
    divider(),
    `  ${label("Owner:")} ${chalk.cyan(data.ownerId)}`,
    `  ${label("Recovered:")} ${chalk.cyan(String(data.recoveredJobIds.length))}`,
    `  ${label("Executed:")} ${chalk.cyan(String(data.executedJobIds.length))}`,
    `  ${label("Failed:")} ${chalk.cyan(String(data.failedJobIds.length))}`,
    "",
  ].join("\n");
}

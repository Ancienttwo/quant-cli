import { z } from "zod";

export const AutomationJobIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/u, "Automation job id must be filesystem-safe.");
export type AutomationJobId = z.infer<typeof AutomationJobIdSchema>;

export const AutomationRunIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/u, "Automation run id must be filesystem-safe.");
export type AutomationRunId = z.infer<typeof AutomationRunIdSchema>;

export const AutomationActorKindSchema = z.enum(["manual", "daemon", "api", "agent"]);
export type AutomationActorKind = z.infer<typeof AutomationActorKindSchema>;

export const AutomationActorSchema = z.object({
  kind: AutomationActorKindSchema,
  id: z.string().min(1),
  requestId: z.string().min(1).optional(),
});
export type AutomationActor = z.infer<typeof AutomationActorSchema>;

export const AutomationScheduleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("every"),
    every: z.string().min(2),
  }),
  z.object({
    kind: z.literal("at"),
    at: z.string().datetime(),
  }),
]);
export type AutomationSchedule = z.infer<typeof AutomationScheduleSchema>;

export const AutomationJobKindSchema = z.enum([
  "autoresearch.track.run",
  "factor.alert.evaluate",
  "publish.submission.check",
]);
export type AutomationJobKind = z.infer<typeof AutomationJobKindSchema>;

export const AutoresearchTrackRunJobParamsSchema = z.object({
  trackId: z.string().min(1),
  iterations: z.number().int().positive().default(1),
  outputDir: z.string().min(1).optional(),
});
export type AutoresearchTrackRunJobParams = z.infer<typeof AutoresearchTrackRunJobParamsSchema>;

export const FactorAlertEvaluateJobParamsSchema = z.object({
  factorId: z.string().min(1).optional(),
});
export type FactorAlertEvaluateJobParams = z.infer<typeof FactorAlertEvaluateJobParamsSchema>;

export const PublishSubmissionCheckJobParamsSchema = z.object({
  publicationId: z.string().min(1),
  platformUrl: z.string().url().optional(),
});
export type PublishSubmissionCheckJobParams = z.infer<typeof PublishSubmissionCheckJobParamsSchema>;

const AutomationJobSpecBaseSchema = z.object({
  jobId: AutomationJobIdSchema,
  schedule: AutomationScheduleSchema,
  executionKey: z.string().min(1),
  actor: AutomationActorSchema,
  createdAt: z.string().datetime(),
});

export const AutoresearchTrackRunJobSpecSchema = AutomationJobSpecBaseSchema.extend({
  kind: z.literal("autoresearch.track.run"),
  params: AutoresearchTrackRunJobParamsSchema,
});
export type AutoresearchTrackRunJobSpec = z.infer<typeof AutoresearchTrackRunJobSpecSchema>;

export const FactorAlertEvaluateJobSpecSchema = AutomationJobSpecBaseSchema.extend({
  kind: z.literal("factor.alert.evaluate"),
  params: FactorAlertEvaluateJobParamsSchema,
});
export type FactorAlertEvaluateJobSpec = z.infer<typeof FactorAlertEvaluateJobSpecSchema>;

export const PublishSubmissionCheckJobSpecSchema = AutomationJobSpecBaseSchema.extend({
  kind: z.literal("publish.submission.check"),
  params: PublishSubmissionCheckJobParamsSchema,
});
export type PublishSubmissionCheckJobSpec = z.infer<typeof PublishSubmissionCheckJobSpecSchema>;

export const AutomationJobSpecSchema = z.discriminatedUnion("kind", [
  AutoresearchTrackRunJobSpecSchema,
  FactorAlertEvaluateJobSpecSchema,
  PublishSubmissionCheckJobSpecSchema,
]);
export type AutomationJobSpec = z.infer<typeof AutomationJobSpecSchema>;

export const AutomationJobStatusSchema = z.enum([
  "scheduled",
  "paused",
  "running",
  "blocked",
  "completed",
]);
export type AutomationJobStatus = z.infer<typeof AutomationJobStatusSchema>;

export const AutomationLeaseSchema = z.object({
  ownerId: z.string().min(1),
  acquiredAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export type AutomationLease = z.infer<typeof AutomationLeaseSchema>;

export const AutomationJobStateSchema = z.object({
  status: AutomationJobStatusSchema,
  nextRunAt: z.string().datetime().nullable(),
  lastRunId: AutomationRunIdSchema.nullable(),
  lastStartedAt: z.string().datetime().nullable(),
  lastFinishedAt: z.string().datetime().nullable(),
  lastSuccessAt: z.string().datetime().nullable(),
  consecutiveFailures: z.number().int().nonnegative(),
  lastError: z.string().min(1).nullable(),
  lastErrorCode: z.string().min(1).nullable(),
  lease: AutomationLeaseSchema.nullable(),
  updatedAt: z.string().datetime(),
});
export type AutomationJobState = z.infer<typeof AutomationJobStateSchema>;

export const AutomationHistoryStatusSchema = z.enum(["success", "failure", "reconciled"]);
export type AutomationHistoryStatus = z.infer<typeof AutomationHistoryStatusSchema>;

export const AutomationHistoryEntrySchema = z.object({
  runId: AutomationRunIdSchema,
  status: AutomationHistoryStatusSchema,
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  summary: z.string().min(1),
  error: z.string().min(1).optional(),
  errorCode: z.string().min(1).optional(),
  nextRunAt: z.string().datetime().nullable(),
  artifactPaths: z.array(z.string().min(1)).default([]),
});
export type AutomationHistoryEntry = z.infer<typeof AutomationHistoryEntrySchema>;

export const AutomationRunOutcomeSchema = z.enum(["completed", "failed"]);
export type AutomationRunOutcome = z.infer<typeof AutomationRunOutcomeSchema>;

export const AutomationRunRecordSchema = z.object({
  jobId: AutomationJobIdSchema,
  runId: AutomationRunIdSchema,
  kind: AutomationJobKindSchema,
  executionKey: z.string().min(1),
  actor: AutomationActorSchema,
  status: AutomationRunOutcomeSchema,
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  summary: z.string().min(1),
  error: z.string().min(1).optional(),
  errorCode: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  artifactPaths: z.array(z.string().min(1)).default([]),
});
export type AutomationRunRecord = z.infer<typeof AutomationRunRecordSchema>;

export const AutomationJobSummarySchema = z.object({
  jobId: AutomationJobIdSchema,
  kind: AutomationJobKindSchema,
  status: AutomationJobStatusSchema,
  executionKey: z.string().min(1),
  nextRunAt: z.string().datetime().nullable(),
  lastRunId: AutomationRunIdSchema.nullable(),
  consecutiveFailures: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
});
export type AutomationJobSummary = z.infer<typeof AutomationJobSummarySchema>;

export const AutomationJobDetailSchema = z.object({
  spec: AutomationJobSpecSchema,
  state: AutomationJobStateSchema,
  history: z.array(AutomationHistoryEntrySchema),
});
export type AutomationJobDetail = z.infer<typeof AutomationJobDetailSchema>;

export const ScheduleAutomationRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("autoresearch.track.run"),
    params: AutoresearchTrackRunJobParamsSchema,
    schedule: AutomationScheduleSchema,
    actor: AutomationActorSchema,
    jobId: AutomationJobIdSchema.optional(),
  }),
  z.object({
    kind: z.literal("factor.alert.evaluate"),
    params: FactorAlertEvaluateJobParamsSchema,
    schedule: AutomationScheduleSchema,
    actor: AutomationActorSchema,
    jobId: AutomationJobIdSchema.optional(),
  }),
  z.object({
    kind: z.literal("publish.submission.check"),
    params: PublishSubmissionCheckJobParamsSchema,
    schedule: AutomationScheduleSchema,
    actor: AutomationActorSchema,
    jobId: AutomationJobIdSchema.optional(),
  }),
]);
export type ScheduleAutomationRequest = z.infer<typeof ScheduleAutomationRequestSchema>;

export interface AutomationHandlerContext {
  actor: AutomationActor;
  runId: string;
}

export interface AutomationHandlerResult {
  summary: string;
  payload?: Record<string, unknown>;
  artifactPaths?: string[];
}

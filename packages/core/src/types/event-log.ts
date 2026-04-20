import { z } from "zod";

export const EventEntitySchema = z.object({
  kind: z.string().min(1),
  id: z.string().min(1),
});
export type EventEntity = z.infer<typeof EventEntitySchema>;

export const EventResultSchema = z.enum(["success", "failure"]);
export type EventResult = z.infer<typeof EventResultSchema>;

export const EventPayloadSchema = z.record(z.string(), z.unknown());
export type EventPayload = z.infer<typeof EventPayloadSchema>;

export const EventLogEntrySchema = z.object({
  seq: z.number().int().nonnegative(),
  ts: z.number().int().nonnegative(),
  type: z.string().min(1),
  entity: EventEntitySchema,
  result: EventResultSchema,
  summary: z.string().min(1).optional(),
  payload: EventPayloadSchema.optional(),
});
export type EventLogEntry = z.infer<typeof EventLogEntrySchema>;

export const EventLogAppendInputSchema = EventLogEntrySchema.omit({
  seq: true,
  ts: true,
});
export type EventLogAppendInput = z.infer<typeof EventLogAppendInputSchema>;

export const EventLogReadInputSchema = z.object({
  afterSeq: z.number().int().nonnegative().default(0),
  limit: z.number().int().positive().optional(),
  type: z.string().min(1).optional(),
  entityKind: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
});
export type EventLogReadInput = z.input<typeof EventLogReadInputSchema>;

export const EventLogQueryInputSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(500).default(100),
  type: z.string().min(1).optional(),
  entityKind: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
});
export type EventLogQueryInput = z.input<typeof EventLogQueryInputSchema>;

export const EventLogQueryResultSchema = z.object({
  entries: z.array(EventLogEntrySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().positive(),
});
export type EventLogQueryResult = z.infer<typeof EventLogQueryResultSchema>;

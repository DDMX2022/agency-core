import { z } from "zod";

// ── Message Envelope Types ────────────────────────────────────────────
export const EnvelopeTypeSchema = z.enum([
  "TASK",
  "RESULT",
  "APPROVAL_REQUEST",
  "EVENT",
  "ERROR",
]);
export type EnvelopeType = z.infer<typeof EnvelopeTypeSchema>;

// ── Payload Schemas per type ──────────────────────────────────────────

export const TaskPayloadSchema = z.object({
  request: z.string().min(1),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  metadata: z.record(z.unknown()).optional(),
});
export type TaskPayload = z.input<typeof TaskPayloadSchema>;

export const ResultPayloadSchema = z.object({
  success: z.boolean(),
  data: z.unknown(),
  summary: z.string().min(1),
  artifactId: z.string().optional(),
});
export type ResultPayload = z.infer<typeof ResultPayloadSchema>;

export const ApprovalRequestPayloadSchema = z.object({
  action: z.string().min(1),
  description: z.string().min(1),
  risk: z.enum(["low", "medium", "high", "critical"]),
  timeoutMs: z.number().int().positive().default(300_000), // 5 minutes
});
export type ApprovalRequestPayload = z.input<typeof ApprovalRequestPayloadSchema>;

export const EventPayloadSchema = z.object({
  eventType: z.string().min(1),
  detail: z.record(z.unknown()),
});
export type EventPayload = z.infer<typeof EventPayloadSchema>;

export const ErrorPayloadSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean().default(false),
  stack: z.string().optional(),
});
export type ErrorPayload = z.input<typeof ErrorPayloadSchema>;

// ── Message Envelope ──────────────────────────────────────────────────

export const MessageEnvelopeSchema = z.object({
  type: EnvelopeTypeSchema,
  runId: z.string().uuid(),
  from: z.string().min(1),
  to: z.string().min(1),
  topic: z.string().min(1),
  payload: z.unknown(),
  requiresApproval: z.boolean().default(false),
  timestamp: z.string().datetime(),
});
export type MessageEnvelope = z.infer<typeof MessageEnvelopeSchema>;

// ── Typed Envelope constructors ───────────────────────────────────────

export function createTaskEnvelope(
  runId: string,
  from: string,
  to: string,
  topic: string,
  payload: TaskPayload,
): MessageEnvelope {
  TaskPayloadSchema.parse(payload);
  return {
    type: "TASK",
    runId,
    from,
    to,
    topic,
    payload,
    requiresApproval: false,
    timestamp: new Date().toISOString(),
  };
}

export function createResultEnvelope(
  runId: string,
  from: string,
  to: string,
  topic: string,
  payload: ResultPayload,
): MessageEnvelope {
  ResultPayloadSchema.parse(payload);
  return {
    type: "RESULT",
    runId,
    from,
    to,
    topic,
    payload,
    requiresApproval: false,
    timestamp: new Date().toISOString(),
  };
}

export function createApprovalRequestEnvelope(
  runId: string,
  from: string,
  to: string,
  topic: string,
  payload: ApprovalRequestPayload,
): MessageEnvelope {
  ApprovalRequestPayloadSchema.parse(payload);
  return {
    type: "APPROVAL_REQUEST",
    runId,
    from,
    to,
    topic,
    payload,
    requiresApproval: true,
    timestamp: new Date().toISOString(),
  };
}

export function createErrorEnvelope(
  runId: string,
  from: string,
  to: string,
  topic: string,
  payload: ErrorPayload,
): MessageEnvelope {
  ErrorPayloadSchema.parse(payload);
  return {
    type: "ERROR",
    runId,
    from,
    to,
    topic,
    payload,
    requiresApproval: false,
    timestamp: new Date().toISOString(),
  };
}

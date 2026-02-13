import { z } from "zod";

// ── OpenClaw Inbound Message ──────────────────────────────────────────
export const OpenClawInboundSchema = z.object({
  type: z.enum(["TASK", "APPROVAL_REQUEST"]),
  runId: z.string().uuid(),
  from: z.string().min(1),
  to: z.string().min(1).default("AgencyCore"),
  topic: z.string().min(1),
  payload: z.object({
    request: z.string().min(1),
    priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    metadata: z.record(z.unknown()).optional(),
  }),
  requiresApproval: z.boolean().default(false),
  timestamp: z.string().datetime(),
});
export type OpenClawInbound = z.infer<typeof OpenClawInboundSchema>;

// ── OpenClaw Outbound Result ──────────────────────────────────────────
export const OpenClawOutboundSchema = z.object({
  type: z.literal("RESULT"),
  runId: z.string().uuid(),
  from: z.literal("AgencyCore"),
  to: z.string().min(1),
  topic: z.string().min(1),
  payload: z.object({
    success: z.boolean(),
    data: z.unknown(),
    summary: z.string().min(1),
    artifactId: z.string().optional(),
  }),
  timestamp: z.string().datetime(),
});
export type OpenClawOutbound = z.infer<typeof OpenClawOutboundSchema>;

// ── Approval Response ─────────────────────────────────────────────────
export const ApprovalResponseSchema = z.object({
  runId: z.string().uuid(),
  approved: z.boolean(),
  reason: z.string().optional(),
  approvedBy: z.string().min(1),
  timestamp: z.string().datetime(),
});
export type ApprovalResponse = z.infer<typeof ApprovalResponseSchema>;

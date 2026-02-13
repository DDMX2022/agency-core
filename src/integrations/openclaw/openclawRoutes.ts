import type { FastifyInstance } from "fastify";
import { OpenClawAdapter } from "./openclawAdapter.js";
import type { Orchestrator } from "../../core/pipeline/orchestrator.js";

const SHARED_SECRET_HEADER = "x-openclaw-secret";

/**
 * Register OpenClaw integration routes on the Fastify server.
 *
 * POST /integrations/openclaw/message   – receive TASK envelope, return RESULT
 * POST /integrations/openclaw/approval  – submit an approval response
 * GET  /integrations/openclaw/approvals – list pending approvals
 */
export function registerOpenClawRoutes(
  fastify: FastifyInstance,
  orchestrator: Orchestrator,
): void {
  const secret = process.env["OPENCLAW_SHARED_SECRET"];
  const adapter = new OpenClawAdapter(orchestrator, secret);

  // ── POST /integrations/openclaw/message ───────────────────────────
  fastify.post<{
    Body: {
      type: string;
      runId: string;
      from: string;
      to?: string;
      topic: string;
      payload: { request: string; priority?: string; metadata?: Record<string, unknown> };
      requiresApproval?: boolean;
      timestamp: string;
    };
  }>("/integrations/openclaw/message", {
    schema: {
      body: {
        type: "object",
        required: ["type", "runId", "from", "topic", "payload", "timestamp"],
        properties: {
          type: { type: "string" },
          runId: { type: "string" },
          from: { type: "string" },
          to: { type: "string" },
          topic: { type: "string" },
          payload: {
            type: "object",
            required: ["request"],
            properties: {
              request: { type: "string" },
              priority: { type: "string" },
              metadata: { type: "object" },
            },
          },
          requiresApproval: { type: "boolean" },
          timestamp: { type: "string" },
        },
      },
    },
    handler: async (req, reply) => {
      // Verify shared secret if configured
      const headerSecret = req.headers[SHARED_SECRET_HEADER] as string | undefined;
      if (!adapter.verifySecret(headerSecret)) {
        return reply.code(401).send({ error: "Invalid or missing shared secret" });
      }

      try {
        const result = await adapter.handleMessage(req.body as Parameters<typeof adapter.handleMessage>[0]);
        return reply.code(200).send(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return reply.code(500).send({ error: message });
      }
    },
  });

  // ── POST /integrations/openclaw/approval ──────────────────────────
  fastify.post<{
    Body: {
      runId: string;
      approved: boolean;
      reason?: string;
      approvedBy: string;
      timestamp: string;
    };
  }>("/integrations/openclaw/approval", {
    schema: {
      body: {
        type: "object",
        required: ["runId", "approved", "approvedBy", "timestamp"],
        properties: {
          runId: { type: "string" },
          approved: { type: "boolean" },
          reason: { type: "string" },
          approvedBy: { type: "string" },
          timestamp: { type: "string" },
        },
      },
    },
    handler: async (req, reply) => {
      const headerSecret = req.headers[SHARED_SECRET_HEADER] as string | undefined;
      if (!adapter.verifySecret(headerSecret)) {
        return reply.code(401).send({ error: "Invalid or missing shared secret" });
      }

      try {
        const result = adapter.handleApproval(req.body as Parameters<typeof adapter.handleApproval>[0]);
        if (!result.found) {
          return reply.code(404).send({ error: `No pending approval for runId ${req.body.runId}` });
        }
        return reply.code(200).send(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return reply.code(500).send({ error: message });
      }
    },
  });

  // ── GET /integrations/openclaw/approvals ──────────────────────────
  fastify.get("/integrations/openclaw/approvals", async (_req, reply) => {
    const pending = adapter.listPendingApprovals();
    return reply.code(200).send({ approvals: pending, count: pending.length });
  });
}

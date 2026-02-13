import pino from "pino";
import { v4 as uuidv4 } from "uuid";
import {
  OpenClawInboundSchema,
  type OpenClawInbound,
  type OpenClawOutbound,
  ApprovalResponseSchema,
  type ApprovalResponse,
} from "./openclaw.schema.js";
import type { Orchestrator } from "../../core/pipeline/orchestrator.js";

const logger = pino({ name: "openclaw-adapter" });

// ── Pending approval store ────────────────────────────────────────────
interface PendingApproval {
  runId: string;
  action: string;
  description: string;
  from: string;
  createdAt: string;
}

/**
 * OpenClawAdapter – bridge between OpenClaw message protocol and
 * the AgencyCore pipeline.
 *
 * Receives TASK envelopes → runs the pipeline → returns RESULT envelopes.
 * Supports approval requests with pending-approval tracking.
 */
export class OpenClawAdapter {
  private readonly orchestrator: Orchestrator;
  private readonly pendingApprovals = new Map<string, PendingApproval>();
  private readonly sharedSecret: string | undefined;

  constructor(orchestrator: Orchestrator, sharedSecret?: string) {
    this.orchestrator = orchestrator;
    this.sharedSecret = sharedSecret;
  }

  /**
   * Verify the shared secret from an incoming request header.
   * Returns true if no secret is configured (open mode) or if it matches.
   */
  verifySecret(headerValue: string | undefined): boolean {
    if (!this.sharedSecret) return true;
    return headerValue === this.sharedSecret;
  }

  /**
   * Handle an inbound TASK message from OpenClaw.
   * Runs the full pipeline and returns a RESULT envelope.
   */
  async handleMessage(inbound: OpenClawInbound): Promise<OpenClawOutbound> {
    // Validate the inbound message
    const validated = OpenClawInboundSchema.parse(inbound);

    logger.info(
      { runId: validated.runId, from: validated.from, topic: validated.topic },
      "OpenClaw TASK received",
    );

    try {
      // Run the pipeline
      const artifact = await this.orchestrator.run(validated.payload.request);

      const result: OpenClawOutbound = {
        type: "RESULT",
        runId: validated.runId,
        from: "AgencyCore",
        to: validated.from,
        topic: validated.topic,
        payload: {
          success: artifact.success,
          data: {
            totalScore: artifact.gatekeeper.totalScore,
            scorecard: artifact.gatekeeper.scorecard,
            actions: artifact.implementor.actions,
            filesCreated: artifact.implementor.filesCreated,
            filesModified: artifact.implementor.filesModified,
            commandsRun: artifact.implementor.commandsRun,
          },
          summary: artifact.gatekeeper.feedback,
          artifactId: artifact.runId,
        },
        timestamp: new Date().toISOString(),
      };

      logger.info(
        { runId: validated.runId, artifactId: artifact.runId },
        "OpenClaw RESULT sent",
      );

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error({ runId: validated.runId, error: message }, "OpenClaw pipeline failed");

      return {
        type: "RESULT",
        runId: validated.runId,
        from: "AgencyCore",
        to: validated.from,
        topic: validated.topic,
        payload: {
          success: false,
          data: { error: message },
          summary: `Pipeline failed: ${message}`,
        },
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Submit an approval request for a pending action.
   */
  submitApprovalRequest(
    runId: string,
    from: string,
    action: string,
    description: string,
  ): string {
    const id = runId;
    this.pendingApprovals.set(id, {
      runId: id,
      action,
      description,
      from,
      createdAt: new Date().toISOString(),
    });
    logger.info({ runId: id, action }, "Approval request created");
    return id;
  }

  /**
   * Handle an approval response.
   */
  handleApproval(response: ApprovalResponse): { found: boolean; approved: boolean } {
    const validated = ApprovalResponseSchema.parse(response);
    const pending = this.pendingApprovals.get(validated.runId);

    if (!pending) {
      logger.warn({ runId: validated.runId }, "No pending approval found");
      return { found: false, approved: false };
    }

    this.pendingApprovals.delete(validated.runId);
    logger.info(
      { runId: validated.runId, approved: validated.approved, by: validated.approvedBy },
      "Approval resolved",
    );

    return { found: true, approved: validated.approved };
  }

  /**
   * List all pending approvals.
   */
  listPendingApprovals(): PendingApproval[] {
    return Array.from(this.pendingApprovals.values());
  }
}

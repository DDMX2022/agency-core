import { describe, it, expect } from "vitest";
import { v4 as uuidv4 } from "uuid";
import {
  MessageEnvelopeSchema,
  TaskPayloadSchema,
  ResultPayloadSchema,
  ApprovalRequestPayloadSchema,
  ErrorPayloadSchema,
  createTaskEnvelope,
  createResultEnvelope,
  createApprovalRequestEnvelope,
  createErrorEnvelope,
} from "../core/protocol/messageEnvelope.schema.js";

describe("Message Envelope Schema", () => {
  const runId = uuidv4();
  const ts = new Date().toISOString();

  // ── Envelope validation ───────────────────────────────────────────

  it("should validate a correct TASK envelope", () => {
    const valid = {
      type: "TASK",
      runId,
      from: "OpenClaw",
      to: "AgencyCore",
      topic: "build-feature",
      payload: { request: "Build a login form", priority: "high" },
      requiresApproval: false,
      timestamp: ts,
    };
    expect(() => MessageEnvelopeSchema.parse(valid)).not.toThrow();
  });

  it("should validate a correct RESULT envelope", () => {
    const valid = {
      type: "RESULT",
      runId,
      from: "AgencyCore",
      to: "OpenClaw",
      topic: "build-feature",
      payload: { success: true, data: {}, summary: "Done" },
      requiresApproval: false,
      timestamp: ts,
    };
    expect(() => MessageEnvelopeSchema.parse(valid)).not.toThrow();
  });

  it("should validate an APPROVAL_REQUEST envelope", () => {
    const valid = {
      type: "APPROVAL_REQUEST",
      runId,
      from: "AgencyCore",
      to: "HumanReviewer",
      topic: "deploy-approval",
      payload: { action: "git push", description: "Push to main", risk: "high" },
      requiresApproval: true,
      timestamp: ts,
    };
    expect(() => MessageEnvelopeSchema.parse(valid)).not.toThrow();
  });

  it("should validate an ERROR envelope", () => {
    const valid = {
      type: "ERROR",
      runId,
      from: "AgencyCore",
      to: "OpenClaw",
      topic: "build-feature",
      payload: { code: "PIPELINE_FAIL", message: "Something broke", retryable: true },
      requiresApproval: false,
      timestamp: ts,
    };
    expect(() => MessageEnvelopeSchema.parse(valid)).not.toThrow();
  });

  it("should reject envelope with invalid type", () => {
    const invalid = {
      type: "INVALID",
      runId,
      from: "A",
      to: "B",
      topic: "t",
      payload: {},
      timestamp: ts,
    };
    expect(() => MessageEnvelopeSchema.parse(invalid)).toThrow();
  });

  it("should reject envelope with missing runId", () => {
    const invalid = {
      type: "TASK",
      from: "A",
      to: "B",
      topic: "t",
      payload: {},
      timestamp: ts,
    };
    expect(() => MessageEnvelopeSchema.parse(invalid)).toThrow();
  });

  // ── Payload validation ────────────────────────────────────────────

  it("should validate TaskPayload", () => {
    expect(() => TaskPayloadSchema.parse({ request: "Do something" })).not.toThrow();
  });

  it("should reject TaskPayload with empty request", () => {
    expect(() => TaskPayloadSchema.parse({ request: "" })).toThrow();
  });

  it("should validate ResultPayload", () => {
    expect(() =>
      ResultPayloadSchema.parse({ success: true, data: null, summary: "OK" }),
    ).not.toThrow();
  });

  it("should validate ApprovalRequestPayload", () => {
    expect(() =>
      ApprovalRequestPayloadSchema.parse({
        action: "deploy",
        description: "Deploy to prod",
        risk: "critical",
      }),
    ).not.toThrow();
  });

  it("should validate ErrorPayload", () => {
    expect(() =>
      ErrorPayloadSchema.parse({ code: "ERR", message: "Bad", retryable: false }),
    ).not.toThrow();
  });

  // ── Constructor functions ─────────────────────────────────────────

  it("should create a TASK envelope via constructor", () => {
    const envelope = createTaskEnvelope(runId, "OpenClaw", "AgencyCore", "build", {
      request: "Build a feature",
    });
    expect(envelope.type).toBe("TASK");
    expect(envelope.runId).toBe(runId);
    expect(envelope.from).toBe("OpenClaw");
    expect(envelope.requiresApproval).toBe(false);
  });

  it("should create a RESULT envelope via constructor", () => {
    const envelope = createResultEnvelope(runId, "AgencyCore", "OpenClaw", "build", {
      success: true,
      data: { files: 3 },
      summary: "3 files created",
    });
    expect(envelope.type).toBe("RESULT");
    expect(envelope.from).toBe("AgencyCore");
  });

  it("should create an APPROVAL_REQUEST envelope via constructor", () => {
    const envelope = createApprovalRequestEnvelope(runId, "AgencyCore", "Human", "deploy", {
      action: "git push",
      description: "Push to main branch",
      risk: "high",
    });
    expect(envelope.type).toBe("APPROVAL_REQUEST");
    expect(envelope.requiresApproval).toBe(true);
  });

  it("should create an ERROR envelope via constructor", () => {
    const envelope = createErrorEnvelope(runId, "AgencyCore", "OpenClaw", "build", {
      code: "PIPELINE_FAIL",
      message: "Pipeline crashed",
    });
    expect(envelope.type).toBe("ERROR");
    expect(envelope.requiresApproval).toBe(false);
  });
});

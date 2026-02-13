import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { v4 as uuidv4 } from "uuid";
import { OpenClawAdapter } from "../integrations/openclaw/openclawAdapter.js";
import { Orchestrator } from "../core/pipeline/orchestrator.js";
import { MockLLM } from "../providers/mock-llm.js";
import type { OpenClawInbound } from "../integrations/openclaw/openclaw.schema.js";

describe("OpenClaw Integration", () => {
  let tempDir: string;
  let orchestrator: Orchestrator;
  let adapter: OpenClawAdapter;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agency-openclaw-test-"));
    orchestrator = new Orchestrator({
      llm: new MockLLM(),
      memoryDir: tempDir,
      workspaceRoot: tempDir,
    });
    await orchestrator.initialize();
    adapter = new OpenClawAdapter(orchestrator);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function makeInbound(overrides: Partial<OpenClawInbound> = {}): OpenClawInbound {
    return {
      type: "TASK",
      runId: uuidv4(),
      from: "OpenClaw",
      to: "AgencyCore",
      topic: "build-feature",
      payload: { request: "Create a hello world function", priority: "medium" },
      requiresApproval: false,
      timestamp: new Date().toISOString(),
      ...overrides,
    };
  }

  // ── handleMessage ─────────────────────────────────────────────────

  it("should handle a TASK message and return a RESULT", async () => {
    const inbound = makeInbound();
    const result = await adapter.handleMessage(inbound);

    expect(result.type).toBe("RESULT");
    expect(result.from).toBe("AgencyCore");
    expect(result.to).toBe("OpenClaw");
    expect(result.payload.success).toBe(true);
    expect(result.payload.summary).toBeTruthy();
    expect(result.payload.artifactId).toBeTruthy();
  });

  it("should preserve the runId from the inbound message", async () => {
    const inbound = makeInbound();
    const result = await adapter.handleMessage(inbound);
    expect(result.runId).toBe(inbound.runId);
  });

  it("should return a failure RESULT on pipeline error", async () => {
    // Create adapter with a broken orchestrator (no init)
    const brokenOrch = new Orchestrator({
      llm: new MockLLM(),
      memoryDir: "/nonexistent/path/that/will/fail",
      workspaceRoot: tempDir,
    });
    const brokenAdapter = new OpenClawAdapter(brokenOrch);

    const inbound = makeInbound();
    const result = await brokenAdapter.handleMessage(inbound);

    expect(result.type).toBe("RESULT");
    expect(result.payload.success).toBe(false);
    expect(result.payload.summary).toContain("failed");
  });

  // ── Secret verification ───────────────────────────────────────────

  it("should allow requests when no secret is configured", () => {
    const openAdapter = new OpenClawAdapter(orchestrator);
    expect(openAdapter.verifySecret(undefined)).toBe(true);
    expect(openAdapter.verifySecret("anything")).toBe(true);
  });

  it("should reject requests with wrong secret", () => {
    const secureAdapter = new OpenClawAdapter(orchestrator, "my-secret");
    expect(secureAdapter.verifySecret("wrong-secret")).toBe(false);
    expect(secureAdapter.verifySecret(undefined)).toBe(false);
  });

  it("should accept requests with correct secret", () => {
    const secureAdapter = new OpenClawAdapter(orchestrator, "my-secret");
    expect(secureAdapter.verifySecret("my-secret")).toBe(true);
  });

  // ── Approval flow ─────────────────────────────────────────────────

  it("should track pending approvals", () => {
    const runId = uuidv4();
    adapter.submitApprovalRequest(runId, "AgencyCore", "git push", "Push to main");

    const pending = adapter.listPendingApprovals();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.runId).toBe(runId);
    expect(pending[0]!.action).toBe("git push");
  });

  it("should resolve an approval", () => {
    const runId = uuidv4();
    adapter.submitApprovalRequest(runId, "AgencyCore", "deploy", "Deploy to prod");

    const result = adapter.handleApproval({
      runId,
      approved: true,
      reason: "Looks good",
      approvedBy: "admin",
      timestamp: new Date().toISOString(),
    });

    expect(result.found).toBe(true);
    expect(result.approved).toBe(true);
    expect(adapter.listPendingApprovals()).toHaveLength(0);
  });

  it("should return found=false for unknown approval", () => {
    const result = adapter.handleApproval({
      runId: uuidv4(),
      approved: false,
      approvedBy: "admin",
      timestamp: new Date().toISOString(),
    });

    expect(result.found).toBe(false);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { Orchestrator } from "../core/pipeline/orchestrator.js";
import { MockLLM } from "../providers/mock-llm.js";

describe("Orchestrator", () => {
  let tempDir: string;
  let orchestrator: Orchestrator;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agency-orch-test-"));
    orchestrator = new Orchestrator({
      llm: new MockLLM(),
      memoryDir: tempDir,
      workspaceRoot: tempDir,
    });
    await orchestrator.initialize();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should run the full 11-agent pipeline successfully", async () => {
    const artifact = await orchestrator.run("Create a hello world function");

    expect(artifact.success).toBe(true);
    expect(artifact.runId).toBeTruthy();
    expect(artifact.observer.agent).toBe("Observer");
    expect(artifact.patternObserver.agent).toBe("PatternObserver");
    expect(artifact.cruxFinder.agent).toBe("CruxFinder");
    expect(artifact.retriever.agent).toBe("Retriever");
    expect(artifact.guide.agent).toBe("Guide");
    expect(artifact.planner.agent).toBe("Planner");
    expect(artifact.safetyGuard.agent).toBe("SafetyGuard");
    expect(artifact.implementor.agent).toBe("Implementor");
    expect(artifact.toolRunner.agent).toBe("ToolRunner");
    expect(artifact.gatekeeper.agent).toBe("Gatekeeper");
    expect(artifact.learner.agent).toBe("Learner");
  });

  it("should store run artifact in memory", async () => {
    const artifact = await orchestrator.run("Test task");
    const loaded = await orchestrator.getMemory().loadRunArtifact(artifact.runId);

    expect(loaded).not.toBeNull();
    expect(loaded!.runId).toBe(artifact.runId);
    expect(loaded!.success).toBe(true);
  });

  it("should store portfolio entry after run", async () => {
    await orchestrator.run("Portfolio test");
    const entries = await orchestrator.getMemory().listPortfolio();

    expect(entries.length).toBe(1);
    expect(entries[0]!.totalScore).toBeGreaterThanOrEqual(0);
    expect(entries[0]!.totalScore).toBeLessThanOrEqual(25);
  });

  it("should run agents in correct order (all 11 outputs present)", async () => {
    const artifact = await orchestrator.run("Order test");

    // Each agent's timestamp should exist
    expect(artifact.observer.timestamp).toBeTruthy();
    expect(artifact.patternObserver.timestamp).toBeTruthy();
    expect(artifact.cruxFinder.timestamp).toBeTruthy();
    expect(artifact.retriever.timestamp).toBeTruthy();
    expect(artifact.guide.timestamp).toBeTruthy();
    expect(artifact.planner.timestamp).toBeTruthy();
    expect(artifact.safetyGuard.timestamp).toBeTruthy();
    expect(artifact.implementor.timestamp).toBeTruthy();
    expect(artifact.toolRunner.timestamp).toBeTruthy();
    expect(artifact.gatekeeper.timestamp).toBeTruthy();
    expect(artifact.learner.timestamp).toBeTruthy();

    // Started should be before completed
    expect(new Date(artifact.startedAt).getTime()).toBeLessThanOrEqual(
      new Date(artifact.completedAt).getTime(),
    );
  });

  it("should classify domain correctly for QA-related requests", async () => {
    const artifact = await orchestrator.run("Write a unit test for the login function");
    expect(artifact.observer.domain).toBe("QA");
  });

  it("should generate scorecard with values in valid range", async () => {
    const artifact = await orchestrator.run("Some task");
    const sc = artifact.gatekeeper.scorecard;

    expect(sc.correctness).toBeGreaterThanOrEqual(0);
    expect(sc.correctness).toBeLessThanOrEqual(5);
    expect(sc.verification).toBeGreaterThanOrEqual(0);
    expect(sc.verification).toBeLessThanOrEqual(5);
    expect(sc.safety).toBeGreaterThanOrEqual(0);
    expect(sc.safety).toBeLessThanOrEqual(5);
    expect(sc.clarity).toBeGreaterThanOrEqual(0);
    expect(sc.clarity).toBeLessThanOrEqual(5);
    expect(sc.autonomy).toBeGreaterThanOrEqual(0);
    expect(sc.autonomy).toBeLessThanOrEqual(5);

    expect(artifact.gatekeeper.totalScore).toBe(
      sc.correctness + sc.verification + sc.safety + sc.clarity + sc.autonomy,
    );
  });

  it("should produce Retriever output with arrays", async () => {
    const artifact = await orchestrator.run("Retrieve test");
    expect(Array.isArray(artifact.retriever.lessons)).toBe(true);
    expect(Array.isArray(artifact.retriever.playbooks)).toBe(true);
    expect(Array.isArray(artifact.retriever.examples)).toBe(true);
  });

  it("should produce Planner output with tasks", async () => {
    const artifact = await orchestrator.run("Plan a feature");
    expect(artifact.planner.tasks.length).toBeGreaterThan(0);
    expect(artifact.planner.tasks[0]!.id).toMatch(/^task-\d{3}$/);
    expect(artifact.planner.tasks[0]!.owner).toBeTruthy();
  });

  it("should produce SafetyGuard output", async () => {
    const artifact = await orchestrator.run("Safety check task");
    expect(typeof artifact.safetyGuard.safe).toBe("boolean");
    expect(Array.isArray(artifact.safetyGuard.risks)).toBe(true);
    expect(Array.isArray(artifact.safetyGuard.blockedActions)).toBe(true);
  });

  it("should produce ToolRunner output in mock mode", async () => {
    const artifact = await orchestrator.run("Run some tools");
    expect(Array.isArray(artifact.toolRunner.executedCommands)).toBe(true);
    expect(Array.isArray(artifact.toolRunner.skippedCommands)).toBe(true);
    // Mock mode: all executed commands should have mockMode=true
    for (const cmd of artifact.toolRunner.executedCommands) {
      expect(cmd.mockMode).toBe(true);
    }
  });

  it("should include Guide bestPractices", async () => {
    const artifact = await orchestrator.run("Best practices test");
    expect(Array.isArray(artifact.guide.bestPractices)).toBe(true);
    expect(artifact.guide.bestPractices.length).toBeGreaterThan(0);
  });

  it("should include Gatekeeper improvements", async () => {
    const artifact = await orchestrator.run("Improvement feedback test");
    expect(Array.isArray(artifact.gatekeeper.improvements)).toBe(true);
  });

  it("should feed Gatekeeper improvements to Guide on second run", async () => {
    // First run – stores improvements
    const first = await orchestrator.run("First run to get feedback");
    // Gatekeeper improvements are stored internally

    // Second run – Guide should receive previousImprovements
    const second = await orchestrator.run("Second run using feedback");
    expect(second.success).toBe(true);
    // If first run had improvements, Guide bestPractices should reflect them
    if (first.gatekeeper.improvements.length > 0) {
      const hasImprovementPractice = second.guide.bestPractices.some((bp) =>
        bp.startsWith("Improvement:"),
      );
      expect(hasImprovementPractice).toBe(true);
    }
  });
});

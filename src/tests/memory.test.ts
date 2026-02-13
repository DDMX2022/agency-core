import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { MemoryManager } from "../core/memory/index.js";
import type { CandidateLesson, Scorecard } from "../core/schemas/index.js";

describe("Memory Manager", () => {
  let tempDir: string;
  let memory: MemoryManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agency-test-"));
    memory = new MemoryManager(tempDir);
    await memory.initialize();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should save and load a run artifact", async () => {
    const artifact = createMockArtifact("test-run-001");
    const filepath = await memory.saveRunArtifact(artifact);
    expect(filepath).toContain("test-run-001.json");

    const loaded = await memory.loadRunArtifact("test-run-001");
    expect(loaded).not.toBeNull();
    expect(loaded!.runId).toBe("test-run-001");
  });

  it("should return null for non-existent artifact", async () => {
    const loaded = await memory.loadRunArtifact("nonexistent-id");
    expect(loaded).toBeNull();
  });

  it("should save candidate lesson and approve it", async () => {
    const lesson: CandidateLesson = {
      title: "Test Lesson",
      content: "Always write tests first",
      tags: ["testing", "tdd"],
      source: "run:abc-123",
    };

    const candidateId = await memory.saveCandidateLesson(lesson, "abc-123");
    expect(candidateId).toBeTruthy();

    // Candidate should exist
    const candidates = await memory.listCandidateLessons();
    expect(candidates.length).toBe(1);
    expect(candidates[0]!.title).toBe("Test Lesson");

    // Approve it
    const lessonPath = await memory.approveLesson(candidateId);
    expect(lessonPath).toContain(".md");

    // Candidate should be removed
    const candidatesAfter = await memory.listCandidateLessons();
    expect(candidatesAfter.length).toBe(0);

    // Approved lesson should exist
    const lessons = await memory.listLessons();
    expect(lessons.length).toBe(1);
    expect(lessons[0]!.title).toBe("Test Lesson");
    expect(lessons[0]!.approvedBy).toBe("Gatekeeper");
  });

  it("should save candidate lesson and reject it", async () => {
    const lesson: CandidateLesson = {
      title: "Bad Lesson",
      content: "This should be rejected",
      tags: ["rejected"],
      source: "run:xyz",
    };

    const candidateId = await memory.saveCandidateLesson(lesson, "xyz");
    await memory.rejectLesson(candidateId);

    const candidates = await memory.listCandidateLessons();
    expect(candidates.length).toBe(0);

    const lessons = await memory.listLessons();
    expect(lessons.length).toBe(0);
  });

  it("should save and list portfolio entries", async () => {
    const entry = {
      runId: "port-001",
      request: "Test request",
      completedAt: new Date().toISOString(),
      scorecard: { correctness: 4, verification: 3, safety: 5, clarity: 4, autonomy: 3 } as Scorecard,
      totalScore: 19,
      artifactPath: "/path/to/artifact.json",
    };

    await memory.savePortfolioEntry(entry);
    const entries = await memory.listPortfolio();
    expect(entries.length).toBe(1);
    expect(entries[0]!.runId).toBe("port-001");
  });

  it("should return empty array when no playbooks exist", async () => {
    const playbooks = await memory.listPlaybooks();
    expect(playbooks).toEqual([]);
  });

  it("should list playbooks from markdown files", async () => {
    const playbooksDir = path.join(tempDir, "playbooks");
    await fs.writeFile(path.join(playbooksDir, "deploy.md"), "# Deploy\nStep 1: build\nStep 2: ship", "utf-8");
    await fs.writeFile(path.join(playbooksDir, "rollback.md"), "# Rollback\nStep 1: revert", "utf-8");

    const playbooks = await memory.listPlaybooks();
    expect(playbooks.length).toBe(2);
    expect(playbooks.some((p) => p.includes("Deploy"))).toBe(true);
    expect(playbooks.some((p) => p.includes("Rollback"))).toBe(true);
  });
});

// Helper to create a mock artifact for testing
function createMockArtifact(runId: string) {
  const ts = new Date().toISOString();
  return {
    runId,
    request: "Test request",
    startedAt: ts,
    completedAt: ts,
    observer: {
      agent: "Observer" as const,
      summary: "Test summary",
      keywords: ["test"],
      domain: "Dev",
      rawInput: "Test",
      timestamp: ts,
    },
    patternObserver: {
      agent: "PatternObserver" as const,
      patterns: [{ name: "test", description: "test pattern", confidence: 0.8 }],
      similarPastTasks: [],
      suggestedApproach: "Test approach",
      timestamp: ts,
    },
    cruxFinder: {
      agent: "CruxFinder" as const,
      coreProblem: "Test problem",
      subProblems: ["Sub 1"],
      assumptions: [],
      constraints: [],
      requiredKnowledge: [],
      timestamp: ts,
    },
    retriever: {
      agent: "Retriever" as const,
      lessons: [],
      playbooks: [],
      examples: [],
      timestamp: ts,
    },
    guide: {
      agent: "Guide" as const,
      plan: [{ stepNumber: 1, action: "Test", rationale: "Test", expectedOutput: "Test" }],
      estimatedComplexity: "low" as const,
      warnings: [],
      bestPractices: ["Follow established project conventions"],
      timestamp: ts,
    },
    planner: {
      agent: "Planner" as const,
      tasks: [
        {
          id: "task-001",
          title: "Test",
          description: "Step 1: Test. Rationale: Test",
          owner: "implementor" as const,
          steps: ["Analyse: Test", "Execute: Test", "Verify: Test"],
          definitionOfDone: ["Test", "No errors or warnings"],
          dependencies: [],
        },
      ],
      timestamp: ts,
    },
    safetyGuard: {
      agent: "SafetyGuard" as const,
      safe: true,
      risks: [],
      blockedActions: [],
      requiresApproval: false,
      timestamp: ts,
    },
    implementor: {
      agent: "Implementor" as const,
      actions: [{ type: "createFile" as const, path: "/test.ts", content: "test", requiresApproval: false, isDestructive: false }],
      explanation: "Test explanation",
      filesCreated: ["/test.ts"],
      filesModified: [],
      commandsRun: [],
      blocked: [],
      timestamp: ts,
    },
    toolRunner: {
      agent: "ToolRunner" as const,
      executedCommands: [
        { command: "createFile: /test.ts", success: true, output: "[MOCK] Would createFile: /test.ts", mockMode: true },
      ],
      skippedCommands: [],
      timestamp: ts,
    },
    gatekeeper: {
      agent: "Gatekeeper" as const,
      scorecard: { correctness: 4, verification: 3, safety: 5, clarity: 4, autonomy: 3 },
      totalScore: 19,
      decision: { approveLesson: true, promote: false, allowClone: false },
      feedback: "Good",
      improvements: [],
      approvedLessons: [],
      rejectedLessons: [],
      timestamp: ts,
    },
    learner: {
      agent: "Learner" as const,
      reflection: "Test reflection",
      candidateLessons: [],
      growthAreas: ["testing"],
      currentLevel: 0,
      questionsForNextTime: [],
      timestamp: ts,
    },
    success: true,
  };
}

import { describe, it, expect } from "vitest";
import {
  ObserverOutputSchema,
  PatternObserverOutputSchema,
  CruxFinderOutputSchema,
  RetrieverOutputSchema,
  GuideOutputSchema,
  PlannerOutputSchema,
  SafetyGuardOutputSchema,
  ImplementorOutputSchema,
  ToolRunnerOutputSchema,
  LearnerOutputSchema,
  GatekeeperOutputSchema,
  ScorecardSchema,
  RunArtifactSchema,
} from "../core/schemas/index.js";

describe("Schema Validation", () => {
  it("should validate a correct Observer output", () => {
    const valid = {
      agent: "Observer",
      summary: "A task summary",
      keywords: ["typescript", "function"],
      domain: "Dev",
      rawInput: "Create a function",
      timestamp: new Date().toISOString(),
    };
    expect(() => ObserverOutputSchema.parse(valid)).not.toThrow();
  });

  it("should reject Observer output with empty keywords", () => {
    const invalid = {
      agent: "Observer",
      summary: "A task summary",
      keywords: [],
      domain: "Dev",
      rawInput: "Create a function",
      timestamp: new Date().toISOString(),
    };
    expect(() => ObserverOutputSchema.parse(invalid)).toThrow();
  });

  it("should validate a correct PatternObserver output", () => {
    const valid = {
      agent: "PatternObserver",
      patterns: [{ name: "test-pattern", description: "A pattern", confidence: 0.8 }],
      similarPastTasks: [],
      suggestedApproach: "Use structured approach",
      timestamp: new Date().toISOString(),
    };
    expect(() => PatternObserverOutputSchema.parse(valid)).not.toThrow();
  });

  it("should reject PatternObserver with confidence out of range", () => {
    const invalid = {
      agent: "PatternObserver",
      patterns: [{ name: "test", description: "desc", confidence: 1.5 }],
      similarPastTasks: [],
      suggestedApproach: "approach",
      timestamp: new Date().toISOString(),
    };
    expect(() => PatternObserverOutputSchema.parse(invalid)).toThrow();
  });

  it("should validate a correct Scorecard", () => {
    const valid = {
      correctness: 4,
      verification: 3,
      safety: 5,
      clarity: 4,
      autonomy: 3,
    };
    expect(() => ScorecardSchema.parse(valid)).not.toThrow();
  });

  it("should reject Scorecard with score above 5", () => {
    const invalid = {
      correctness: 6,
      verification: 3,
      safety: 5,
      clarity: 4,
      autonomy: 3,
    };
    expect(() => ScorecardSchema.parse(invalid)).toThrow();
  });

  it("should validate a correct CruxFinder output", () => {
    const valid = {
      agent: "CruxFinder",
      coreProblem: "Build a function",
      subProblems: ["Write the function", "Write the test"],
      assumptions: ["Node.js available"],
      constraints: ["Must be TypeScript"],
      requiredKnowledge: ["TypeScript basics"],
      timestamp: new Date().toISOString(),
    };
    expect(() => CruxFinderOutputSchema.parse(valid)).not.toThrow();
  });

  it("should validate a correct Retriever output", () => {
    const valid = {
      agent: "Retriever",
      lessons: ["Use strict mode for safety"],
      playbooks: ["# Deployment playbook"],
      examples: ['Run abc-123: "deploy service" (score: 20/25)'],
      timestamp: new Date().toISOString(),
    };
    expect(() => RetrieverOutputSchema.parse(valid)).not.toThrow();
  });

  it("should validate Retriever output with empty arrays", () => {
    const valid = {
      agent: "Retriever",
      lessons: [],
      playbooks: [],
      examples: [],
      timestamp: new Date().toISOString(),
    };
    expect(() => RetrieverOutputSchema.parse(valid)).not.toThrow();
  });

  it("should validate a correct Guide output with bestPractices", () => {
    const valid = {
      agent: "Guide",
      plan: [
        {
          stepNumber: 1,
          action: "Create file",
          rationale: "Needed for implementation",
          expectedOutput: "File created",
        },
      ],
      estimatedComplexity: "low",
      warnings: [],
      bestPractices: ["Follow established project conventions"],
      timestamp: new Date().toISOString(),
    };
    expect(() => GuideOutputSchema.parse(valid)).not.toThrow();
  });

  it("should validate a correct Planner output", () => {
    const valid = {
      agent: "Planner",
      tasks: [
        {
          id: "task-001",
          title: "Write the function",
          description: "Step 1: Write the function. Rationale: Core requirement",
          owner: "implementor",
          steps: ["Analyse: Core requirement", "Execute: Write the function", "Verify: Function works"],
          definitionOfDone: ["Function works", "No errors or warnings"],
          dependencies: [],
        },
      ],
      timestamp: new Date().toISOString(),
    };
    expect(() => PlannerOutputSchema.parse(valid)).not.toThrow();
  });

  it("should reject Planner output with empty tasks", () => {
    const invalid = {
      agent: "Planner",
      tasks: [],
      timestamp: new Date().toISOString(),
    };
    expect(() => PlannerOutputSchema.parse(invalid)).toThrow();
  });

  it("should reject Planner task with invalid owner", () => {
    const invalid = {
      agent: "Planner",
      tasks: [
        {
          id: "task-001",
          title: "Do something",
          description: "A task",
          owner: "hacker",
          steps: ["step 1"],
          definitionOfDone: ["done"],
          dependencies: [],
        },
      ],
      timestamp: new Date().toISOString(),
    };
    expect(() => PlannerOutputSchema.parse(invalid)).toThrow();
  });

  it("should validate a correct SafetyGuard output", () => {
    const valid = {
      agent: "SafetyGuard",
      safe: true,
      risks: [],
      blockedActions: [],
      requiresApproval: false,
      timestamp: new Date().toISOString(),
    };
    expect(() => SafetyGuardOutputSchema.parse(valid)).not.toThrow();
  });

  it("should validate SafetyGuard with risks and blocked actions", () => {
    const valid = {
      agent: "SafetyGuard",
      safe: false,
      risks: ["Dangerous pattern found", "Out-of-workspace path"],
      blockedActions: ["Task task-001: dangerous rm -rf"],
      requiresApproval: true,
      timestamp: new Date().toISOString(),
    };
    expect(() => SafetyGuardOutputSchema.parse(valid)).not.toThrow();
  });

  it("should validate a correct Implementor output", () => {
    const valid = {
      agent: "Implementor",
      actions: [
        {
          type: "createFile",
          path: "/sandbox/hello.ts",
          content: "export const hello = () => 'hello';",
          requiresApproval: false,
          isDestructive: false,
        },
      ],
      explanation: "Created a hello world function",
      filesCreated: ["/sandbox/hello.ts"],
      filesModified: [],
      commandsRun: [],
      blocked: [],
      timestamp: new Date().toISOString(),
    };
    expect(() => ImplementorOutputSchema.parse(valid)).not.toThrow();
  });

  it("should validate a correct ToolRunner output", () => {
    const valid = {
      agent: "ToolRunner",
      executedCommands: [
        {
          command: "echo hello",
          success: true,
          output: "[MOCK] Would execute: echo hello",
          mockMode: true,
        },
      ],
      skippedCommands: ["BLOCKED (dangerous): rm -rf /"],
      timestamp: new Date().toISOString(),
    };
    expect(() => ToolRunnerOutputSchema.parse(valid)).not.toThrow();
  });

  it("should validate ToolRunner output with empty arrays", () => {
    const valid = {
      agent: "ToolRunner",
      executedCommands: [],
      skippedCommands: [],
      timestamp: new Date().toISOString(),
    };
    expect(() => ToolRunnerOutputSchema.parse(valid)).not.toThrow();
  });

  it("should validate a correct Learner output", () => {
    const valid = {
      agent: "Learner",
      reflection: "Learned about TypeScript functions",
      candidateLessons: [
        {
          title: "TS functions",
          content: "TypeScript functions should be typed",
          tags: ["typescript"],
          source: "run:abc-123",
        },
      ],
      growthAreas: ["TypeScript mastery"],
      currentLevel: 0,
      questionsForNextTime: ["How to use generics?"],
      timestamp: new Date().toISOString(),
    };
    expect(() => LearnerOutputSchema.parse(valid)).not.toThrow();
  });

  it("should validate a correct Gatekeeper output with improvements", () => {
    const valid = {
      agent: "Gatekeeper",
      scorecard: {
        correctness: 4,
        verification: 3,
        safety: 5,
        clarity: 4,
        autonomy: 3,
      },
      totalScore: 19,
      decision: {
        approveLesson: true,
        promote: false,
        allowClone: false,
      },
      feedback: "Good performance",
      improvements: ["Add more thorough testing"],
      approvedLessons: ["lesson-1"],
      rejectedLessons: [],
      timestamp: new Date().toISOString(),
    };
    expect(() => GatekeeperOutputSchema.parse(valid)).not.toThrow();
  });
});

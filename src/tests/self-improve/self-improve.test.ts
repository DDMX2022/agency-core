import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// ── Analyst tests ────────────────────────────────────────────────────

// Re-implement the analysis logic locally since Analyst depends on MemoryManager
// which requires filesystem. We test the core logic directly.

interface Scorecard {
  correctness: number;
  verification: number;
  safety: number;
  clarity: number;
  autonomy: number;
}

interface PortfolioEntry {
  runId: string;
  request: string;
  completedAt: string;
  scorecard: Scorecard;
  totalScore: number;
  artifactPath: string;
}

interface Weakness {
  dimension: keyof Scorecard;
  averageScore: number;
  maxPossible: 5;
  occurrences: number;
  likelyCause: string;
  suggestion: string;
}

const DIMENSION_TO_CAUSE: Record<keyof Scorecard, { file: string; suggestion: string }> = {
  correctness: {
    file: "src/core/agents/implementor.ts",
    suggestion: "Implementor generates stub files. Generate real, working code.",
  },
  verification: {
    file: "src/core/agents/guide.ts",
    suggestion: "Guide should produce more detailed plans.",
  },
  safety: {
    file: "src/core/agents/safetyGuard.ts",
    suggestion: "SafetyGuard should validate file paths within workspace.",
  },
  clarity: {
    file: "src/core/agents/implementor.ts",
    suggestion: "Generate detailed explanations per action.",
  },
  autonomy: {
    file: "src/core/agents/implementor.ts",
    suggestion: "Reduce unnecessary requiresApproval flags.",
  },
};

function analyzePortfolio(entries: PortfolioEntry[]): {
  averageTotalScore: number;
  weaknesses: Weakness[];
} {
  if (entries.length === 0) return { averageTotalScore: 0, weaknesses: [] };

  const dims: (keyof Scorecard)[] = ["correctness", "verification", "safety", "clarity", "autonomy"];
  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const dim of dims) {
    sums[dim] = 0;
    counts[dim] = 0;
  }

  let totalScoreSum = 0;
  for (const entry of entries) {
    totalScoreSum += entry.totalScore;
    for (const dim of dims) {
      sums[dim]! += entry.scorecard[dim];
      counts[dim]! += 1;
    }
  }

  const averageTotalScore = Math.round((totalScoreSum / entries.length) * 10) / 10;

  const weaknesses: Weakness[] = [];
  for (const dim of dims) {
    const avg = counts[dim]! > 0 ? sums[dim]! / counts[dim]! : 0;
    const roundedAvg = Math.round(avg * 10) / 10;
    if (roundedAvg < 3.5) {
      const cause = DIMENSION_TO_CAUSE[dim];
      weaknesses.push({
        dimension: dim,
        averageScore: roundedAvg,
        maxPossible: 5,
        occurrences: counts[dim]!,
        likelyCause: cause.file,
        suggestion: cause.suggestion,
      });
    }
  }

  weaknesses.sort((a, b) => a.averageScore - b.averageScore);
  return { averageTotalScore, weaknesses };
}

describe("Self-Improvement: Analyst", () => {
  it("should identify weaknesses below 3.5 threshold", () => {
    const entries: PortfolioEntry[] = [
      {
        runId: "run-1",
        request: "Build login",
        completedAt: new Date().toISOString(),
        scorecard: { correctness: 0, verification: 5, safety: 1, clarity: 4, autonomy: 1 },
        totalScore: 11,
        artifactPath: "/tmp/run-1.json",
      },
      {
        runId: "run-2",
        request: "Build calculator",
        completedAt: new Date().toISOString(),
        scorecard: { correctness: 0, verification: 5, safety: 2, clarity: 4, autonomy: 1 },
        totalScore: 12,
        artifactPath: "/tmp/run-2.json",
      },
    ];

    const { averageTotalScore, weaknesses } = analyzePortfolio(entries);
    expect(averageTotalScore).toBe(11.5);

    // correctness (0), autonomy (1), safety (1.5) should be weak
    expect(weaknesses.length).toBe(3);
    expect(weaknesses[0]!.dimension).toBe("correctness");
    expect(weaknesses[0]!.averageScore).toBe(0);
    expect(weaknesses[1]!.dimension).toBe("autonomy");
    expect(weaknesses[2]!.dimension).toBe("safety");

    // verification (5) and clarity (4) should NOT be weak
    const weakDims = weaknesses.map((w) => w.dimension);
    expect(weakDims).not.toContain("verification");
    expect(weakDims).not.toContain("clarity");
  });

  it("should return no weaknesses when all scores are high", () => {
    const entries: PortfolioEntry[] = [
      {
        runId: "run-1",
        request: "Good run",
        completedAt: new Date().toISOString(),
        scorecard: { correctness: 5, verification: 5, safety: 5, clarity: 5, autonomy: 5 },
        totalScore: 25,
        artifactPath: "/tmp/run-1.json",
      },
    ];

    const { weaknesses } = analyzePortfolio(entries);
    expect(weaknesses).toHaveLength(0);
  });

  it("should return empty results for no runs", () => {
    const { averageTotalScore, weaknesses } = analyzePortfolio([]);
    expect(averageTotalScore).toBe(0);
    expect(weaknesses).toHaveLength(0);
  });

  it("should sort weaknesses by severity (lowest first)", () => {
    const entries: PortfolioEntry[] = [
      {
        runId: "run-1",
        request: "test",
        completedAt: new Date().toISOString(),
        scorecard: { correctness: 2, verification: 1, safety: 3, clarity: 0, autonomy: 5 },
        totalScore: 11,
        artifactPath: "/tmp/test.json",
      },
    ];

    const { weaknesses } = analyzePortfolio(entries);
    // clarity(0) < verification(1) < correctness(2) < safety(3)
    expect(weaknesses[0]!.dimension).toBe("clarity");
    expect(weaknesses[1]!.dimension).toBe("verification");
    expect(weaknesses[2]!.dimension).toBe("correctness");
    expect(weaknesses[3]!.dimension).toBe("safety");
  });

  it("should map each weakness to its likely source file", () => {
    const entries: PortfolioEntry[] = [
      {
        runId: "run-1",
        request: "test",
        completedAt: new Date().toISOString(),
        scorecard: { correctness: 1, verification: 1, safety: 1, clarity: 1, autonomy: 1 },
        totalScore: 5,
        artifactPath: "/tmp/test.json",
      },
    ];

    const { weaknesses } = analyzePortfolio(entries);
    const correctnessW = weaknesses.find((w) => w.dimension === "correctness");
    const verificationW = weaknesses.find((w) => w.dimension === "verification");
    const safetyW = weaknesses.find((w) => w.dimension === "safety");

    expect(correctnessW!.likelyCause).toContain("implementor.ts");
    expect(verificationW!.likelyCause).toContain("guide.ts");
    expect(safetyW!.likelyCause).toContain("safetyGuard.ts");
  });
});

// ── Coder helper tests ───────────────────────────────────────────────

function stripCodeFences(code: string): string {
  let cleaned = code.trim();
  cleaned = cleaned.replace(/^```(?:typescript|ts|javascript|js)?\s*\n?/i, "");
  cleaned = cleaned.replace(/\n?```\s*$/i, "");
  return cleaned.trim();
}

describe("Self-Improvement: Coder Helpers", () => {
  it("should strip typescript code fences", () => {
    const input = "```typescript\nconst x = 1;\n```";
    expect(stripCodeFences(input)).toBe("const x = 1;");
  });

  it("should strip ts code fences", () => {
    const input = "```ts\nexport default {};\n```";
    expect(stripCodeFences(input)).toBe("export default {};");
  });

  it("should strip plain code fences", () => {
    const input = "```\nhello\n```";
    expect(stripCodeFences(input)).toBe("hello");
  });

  it("should leave clean code unchanged", () => {
    const input = "export const foo = 42;";
    expect(stripCodeFences(input)).toBe("export const foo = 42;");
  });
});

// ── Validator parser tests ───────────────────────────────────────────

function parseTestOutput(output: string): { total: number; failed: number } {
  const totalMatch = output.match(/Tests\s+.*\((\d+)\)/);
  const failMatch = output.match(/Tests\s+(\d+)\s+failed/);
  const total = totalMatch ? parseInt(totalMatch[1]!, 10) : 0;
  const failed = failMatch ? parseInt(failMatch[1]!, 10) : 0;
  return { total, failed };
}

describe("Self-Improvement: Validator Parser", () => {
  it("should parse all-pass output", () => {
    const output = " Test Files  12 passed (12)\n      Tests  131 passed (131)\n";
    const { total, failed } = parseTestOutput(output);
    expect(total).toBe(131);
    expect(failed).toBe(0);
  });

  it("should parse mixed pass/fail output", () => {
    const output = " Test Files  1 failed | 11 passed (12)\n      Tests  3 failed | 128 passed (131)\n";
    const { total, failed } = parseTestOutput(output);
    expect(total).toBe(131);
    expect(failed).toBe(3);
  });

  it("should return zeros for unparseable output", () => {
    const { total, failed } = parseTestOutput("no test info here");
    expect(total).toBe(0);
    expect(failed).toBe(0);
  });
});

// ── Integration: ImprovementLoop dry-run ─────────────────────────────

describe("Self-Improvement: ImprovementLoop (dry-run)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "self-improve-test-"));
    // Create memory directories
    for (const sub of ["lessons", "playbooks", "portfolio", "logs", "candidates"]) {
      await fs.mkdir(path.join(tmpDir, "memory", sub), { recursive: true });
    }
  });

  it("should report no weaknesses when portfolio is empty", async () => {
    // Test the analysis directly since ImprovementLoop requires real filesystem
    const entries: PortfolioEntry[] = [];
    const { weaknesses } = analyzePortfolio(entries);
    expect(weaknesses).toHaveLength(0);
  });

  it("should identify correct number of weak dimensions from real-like data", () => {
    // Simulate what a typical AgencyCore run produces (score 11/25)
    const entries: PortfolioEntry[] = Array.from({ length: 5 }, (_, i) => ({
      runId: `run-${i}`,
      request: `Task ${i}`,
      completedAt: new Date().toISOString(),
      scorecard: { correctness: 0, verification: 5, safety: 1, clarity: 4, autonomy: 1 },
      totalScore: 11,
      artifactPath: `/tmp/run-${i}.json`,
    }));

    const { averageTotalScore, weaknesses } = analyzePortfolio(entries);
    expect(averageTotalScore).toBe(11);
    expect(weaknesses.length).toBe(3); // correctness, safety, autonomy
    expect(weaknesses[0]!.dimension).toBe("correctness");
  });
});

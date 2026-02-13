import pino from "pino";
import type { MemoryManager, PortfolioEntry } from "../core/memory/index.js";
import type { Scorecard } from "../core/schemas/index.js";

const logger = pino({ name: "self-improve-analyst" });

/**
 * Weakness — a specific scorecard dimension that is consistently low.
 */
export interface Weakness {
  dimension: keyof Scorecard;
  averageScore: number;
  maxPossible: 5;
  occurrences: number;
  /** Which source files are most likely responsible. */
  likelyCause: string;
  /** Concrete improvement suggestion. */
  suggestion: string;
}

/**
 * AnalysisReport — the output of the Analyst.
 */
export interface AnalysisReport {
  totalRuns: number;
  averageTotalScore: number;
  bestScore: number;
  worstScore: number;
  weaknesses: Weakness[];
  timestamp: string;
}

/** Map each scorecard dimension to the code most likely responsible. */
const DIMENSION_TO_CAUSE: Record<keyof Scorecard, { file: string; suggestion: string }> = {
  correctness: {
    file: "src/core/agents/implementor.ts",
    suggestion:
      "Implementor generates stub files (`export {};`). Generate real, working code from the Guide plan. " +
      "Parse each Guide step into meaningful TypeScript code with actual logic, imports, and exports.",
  },
  verification: {
    file: "src/core/agents/guide.ts",
    suggestion:
      "Guide should produce more detailed plans with verification steps. " +
      "Add a final 'verify' step that checks outputs against requirements.",
  },
  safety: {
    file: "src/core/agents/safetyGuard.ts",
    suggestion:
      "SafetyGuard should validate file paths are within workspace, check for destructive patterns, " +
      "and flag commands that modify system files. Add path-traversal detection.",
  },
  clarity: {
    file: "src/core/agents/implementor.ts",
    suggestion:
      "Implementor explanation is too short. Generate detailed explanations per action: " +
      "what the file does, why it was created, and how it fits the plan.",
  },
  autonomy: {
    file: "src/core/agents/implementor.ts",
    suggestion:
      "Reduce unnecessary requiresApproval flags. Only flag truly destructive ops (delete, overwrite). " +
      "createFile actions in the workspace should not need approval.",
  },
};

/**
 * Analyst
 * Reads the portfolio of past runs, computes average scores per dimension,
 * and identifies the weakest areas with concrete improvement suggestions.
 */
export class Analyst {
  constructor(private readonly memory: MemoryManager) {}

  async analyze(minRuns?: number): Promise<AnalysisReport> {
    const portfolio = await this.memory.listPortfolio();
    const threshold = minRuns ?? 1;

    if (portfolio.length < threshold) {
      logger.info({ runs: portfolio.length, threshold }, "Not enough runs to analyze");
      return {
        totalRuns: portfolio.length,
        averageTotalScore: 0,
        bestScore: 0,
        worstScore: 0,
        weaknesses: [],
        timestamp: new Date().toISOString(),
      };
    }

    // Compute per-dimension averages
    const dims: (keyof Scorecard)[] = [
      "correctness", "verification", "safety", "clarity", "autonomy",
    ];

    const sums: Record<string, number> = {};
    const counts: Record<string, number> = {};
    for (const dim of dims) {
      sums[dim] = 0;
      counts[dim] = 0;
    }

    let totalScoreSum = 0;
    let best = 0;
    let worst = 25;

    for (const entry of portfolio) {
      totalScoreSum += entry.totalScore;
      if (entry.totalScore > best) best = entry.totalScore;
      if (entry.totalScore < worst) worst = entry.totalScore;

      for (const dim of dims) {
        sums[dim]! += entry.scorecard[dim];
        counts[dim]! += 1;
      }
    }

    const averageTotalScore = Math.round((totalScoreSum / portfolio.length) * 10) / 10;

    // Identify weaknesses: any dimension averaging below 3.5/5
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

    // Sort weaknesses by severity (lowest score first)
    weaknesses.sort((a, b) => a.averageScore - b.averageScore);

    logger.info(
      { totalRuns: portfolio.length, averageTotalScore, weaknesses: weaknesses.length },
      "Analysis complete",
    );

    return {
      totalRuns: portfolio.length,
      averageTotalScore,
      bestScore: best,
      worstScore: worst,
      weaknesses,
      timestamp: new Date().toISOString(),
    };
  }
}

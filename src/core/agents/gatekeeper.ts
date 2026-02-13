import type { LLMProvider } from "../../providers/llm-provider.js";
import type { GatekeeperOutput, Scorecard, PipelineContext } from "../schemas/index.js";
import type { MemoryManager } from "../memory/index.js";

/**
 * Gatekeeper (Evaluator) Agent
 * Uses the LLM to score the pipeline run on 5 quality dimensions (0-5 each).
 * ONLY the Gatekeeper can approve lessons and promotions.
 */
export class Gatekeeper {
  constructor(
    private readonly llm: LLMProvider,
    private readonly memory: MemoryManager,
  ) {}

  async run(_input: string, context: PipelineContext): Promise<GatekeeperOutput> {
    const impl = context.implementor;
    if (!impl) {
      throw new Error("Gatekeeper requires Implementor output in context");
    }

    // ── LLM-based scoring ──────────────────────────────────────────
    const scorecard = await this.llmScorecard(context);
    const totalScore =
      scorecard.correctness +
      scorecard.verification +
      scorecard.safety +
      scorecard.clarity +
      scorecard.autonomy;

    // Evaluate candidate lessons from Learner (if available)
    const approvedLessons: string[] = [];
    const rejectedLessons: string[] = [];

    if (context.learner) {
      for (const lesson of context.learner.candidateLessons) {
        const candidateId = await this.memory.saveCandidateLesson(lesson, context.runId);
        if (totalScore >= 15) {
          await this.memory.approveLesson(candidateId);
          approvedLessons.push(lesson.title);
        } else {
          await this.memory.rejectLesson(candidateId);
          rejectedLessons.push(lesson.title);
        }
      }
    }

    // Promotion decision
    const promote = totalScore >= 20;
    const currentLevel = context.learner?.currentLevel ?? 0;
    const newLevel = promote ? Math.min(currentLevel + 1, 3) : undefined;

    return {
      agent: "Gatekeeper",
      scorecard,
      totalScore,
      decision: {
        approveLesson: approvedLessons.length > 0,
        promote,
        newLevel,
        allowClone: totalScore >= 22,
      },
      feedback: this.generateFeedback(scorecard, totalScore),
      improvements: this.generateImprovements(scorecard, context),
      approvedLessons,
      rejectedLessons,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Ask the LLM to evaluate the pipeline output across 5 dimensions.
   * Returns a Scorecard with integer scores 0-5 per dimension.
   */
  private async llmScorecard(context: PipelineContext): Promise<Scorecard> {
    const impl = context.implementor!;
    const guide = context.guide;
    const obs = context.observer;
    const crux = context.cruxFinder;
    const safety = context.safetyGuard;

    const prompt = `You are a strict quality evaluator for an AI coding agent pipeline.

Given the user request and the pipeline output below, score each dimension from 0 to 5.

DIMENSIONS:
- correctness: Does the output correctly solve the user's request? Are the generated files/actions appropriate and complete?
- verification: Were proper planning and validation steps taken? Is there a clear plan that was followed?
- safety: Were dangerous operations avoided? Were permissions respected? Were safety concerns handled?
- clarity: Is the output well-explained? Are file names meaningful? Is the explanation helpful?
- autonomy: Did the system work independently and efficiently? Did it complete all necessary steps?

USER REQUEST: "${context.request}"

OBSERVER SUMMARY: ${obs ? obs.summary : "N/A"}
CORE PROBLEM: ${crux ? crux.coreProblem : "N/A"}
SUB-PROBLEMS: ${crux ? crux.subProblems.join(", ") : "N/A"}
PLAN STEPS: ${guide ? guide.plan.map((s) => s.action).join(" → ") : "N/A"}
SAFETY RISKS: ${safety ? safety.risks.join(", ") || "None" : "N/A"}
ACTIONS PROPOSED: ${impl.actions.length}
ACTIONS BLOCKED: ${impl.blocked.length} ${impl.blocked.length > 0 ? `(${impl.blocked.join("; ")})` : ""}
FILES CREATED: ${impl.filesCreated.length > 0 ? impl.filesCreated.join(", ") : "None"}
EXPLANATION: ${impl.explanation}

Reply with ONLY a JSON object, no markdown fences, no explanation:
{"correctness":N,"verification":N,"safety":N,"clarity":N,"autonomy":N}

Each value must be an integer 0-5. Be honest and varied — not every run deserves the same score.`;

    try {
      const raw = await this.llm.generate(
        prompt,
        "Evaluate the pipeline run and return JSON scores.",
      );

      // Extract JSON from response (handle potential markdown fences)
      const jsonStr = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

      return {
        correctness: clampScore(parsed["correctness"]),
        verification: clampScore(parsed["verification"]),
        safety: clampScore(parsed["safety"]),
        clarity: clampScore(parsed["clarity"]),
        autonomy: clampScore(parsed["autonomy"]),
      };
    } catch {
      // Fallback: deterministic scoring if LLM fails
      return this.fallbackScorecard(context);
    }
  }

  /** Fallback scoring if LLM evaluation fails. */
  private fallbackScorecard(context: PipelineContext): Scorecard {
    const impl = context.implementor!;
    const guide = context.guide;
    const totalActions = impl.actions.length;
    const blockedCount = impl.blocked.length;
    const successRate = totalActions > 0 ? (totalActions - blockedCount) / totalActions : 0;

    return {
      correctness: Math.round(successRate * 5),
      verification: guide ? Math.min(guide.plan.length, 5) : 1,
      safety: blockedCount === 0 ? 5 : Math.max(1, 5 - blockedCount),
      clarity: impl.explanation.length > 20 ? 4 : 2,
      autonomy: Math.min(5, Math.round(successRate * 4) + 1),
    };
  }

  private generateFeedback(scorecard: Scorecard, totalScore: number): string {
    const parts: string[] = [];
    if (totalScore >= 20) parts.push("Excellent work. Promotion candidate.");
    else if (totalScore >= 15) parts.push("Good performance. Lessons approved.");
    else if (totalScore >= 10) parts.push("Acceptable but needs improvement.");
    else parts.push("Below expectations. Review needed.");

    if (scorecard.safety < 3) parts.push("Safety concerns detected – review permissions.");
    if (scorecard.correctness < 3) parts.push("Correctness issues – review implementation.");

    return parts.join(" ");
  }

  /** Generate concrete improvements for Guide feedback loop. */
  private generateImprovements(scorecard: Scorecard, context: PipelineContext): string[] {
    const improvements: string[] = [];

    if (scorecard.safety < 4) {
      improvements.push("Add explicit safety checks before destructive operations");
    }
    if (scorecard.correctness < 4) {
      improvements.push("Improve verification steps to catch implementation errors");
    }
    if (scorecard.verification < 4) {
      improvements.push("Add more thorough testing and verification steps");
    }
    if (scorecard.clarity < 4) {
      improvements.push("Provide more detailed explanations for each action");
    }
    if (scorecard.autonomy < 4) {
      improvements.push("Reduce unnecessary approval requests for safe operations");
    }

    if (context.safetyGuard && context.safetyGuard.risks.length > 0) {
      improvements.push(`Address ${context.safetyGuard.risks.length} safety risks in plan`);
    }

    return improvements;
  }
}

/** Clamp a value to an integer 0-5. */
function clampScore(val: unknown): number {
  const n = typeof val === "number" ? val : Number(val);
  if (isNaN(n)) return 2;
  return Math.max(0, Math.min(5, Math.round(n)));
}

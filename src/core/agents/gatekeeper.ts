import type { LLMProvider } from "../../providers/llm-provider.js";
import type { GatekeeperOutput, Scorecard, PipelineContext } from "../schemas/index.js";
import type { MemoryManager } from "../memory/index.js";

/**
 * Gatekeeper (Evaluator) Agent
 * Scores the pipeline run, decides on lesson approval, promotion, and cloning.
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

    await this.llm.generate(
      "Gatekeeper: Evaluate the implementation quality and safety.",
      JSON.stringify({
        actions: impl.actions.length,
        blocked: impl.blocked.length,
        filesCreated: impl.filesCreated.length,
      }),
    );

    // Deterministic scoring based on outputs
    const scorecard = this.computeScorecard(context);
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

  private computeScorecard(context: PipelineContext): Scorecard {
    const impl = context.implementor!;
    const guide = context.guide;

    // Correctness: based on how many actions succeeded
    const totalActions = impl.actions.length;
    const blockedCount = impl.blocked.length;
    const successRate = totalActions > 0 ? (totalActions - blockedCount) / totalActions : 0;
    const correctness = Math.round(successRate * 5);

    // Verification: based on whether a plan existed
    const verification = guide ? Math.min(guide.plan.length, 5) : 1;

    // Safety: higher if nothing was blocked (means no dangerous actions attempted)
    const safety = blockedCount === 0 ? 5 : Math.max(1, 5 - blockedCount);

    // Clarity: based on explanation length
    const clarity = impl.explanation.length > 20 ? 4 : 2;

    // Autonomy: based on how many steps completed without issues
    const autonomy = Math.min(5, Math.round(successRate * 4) + 1);

    return { correctness, verification, safety, clarity, autonomy };
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

    // If SafetyGuard flagged risks, note them
    if (context.safetyGuard && context.safetyGuard.risks.length > 0) {
      improvements.push(`Address ${context.safetyGuard.risks.length} safety risks in plan`);
    }

    return improvements;
  }
}

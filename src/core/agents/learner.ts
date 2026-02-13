import type { LLMProvider } from "../../providers/llm-provider.js";
import type { LearnerOutput, CandidateLesson, PipelineContext } from "../schemas/index.js";

/**
 * Learner Agent
 * A child-like agent that reflects on the run, extracts lessons,
 * identifies growth areas, and proposes candidate lessons for Gatekeeper review.
 */
export class Learner {
  private level: number = 0;

  constructor(private readonly llm: LLMProvider) {}

  setLevel(level: number): void {
    this.level = Math.max(0, Math.min(3, level));
  }

  getLevel(): number {
    return this.level;
  }

  async run(_input: string, context: PipelineContext): Promise<LearnerOutput> {
    const impl = context.implementor;
    const guide = context.guide;
    const obs = context.observer;
    if (!impl || !guide || !obs) {
      throw new Error("Learner requires Observer, Guide, and Implementor output");
    }

    const reasoning = await this.llm.generate(
      "Learner: Reflect on what was done and what can be learned.",
      JSON.stringify({
        domain: obs.domain,
        stepsPlanned: guide.plan.length,
        actionsExecuted: impl.actions.length,
        blocked: impl.blocked.length,
      }),
    );

    // Extract candidate lessons from the run
    const candidateLessons: CandidateLesson[] = [];

    // Lesson from the domain
    candidateLessons.push({
      title: `Working in ${obs.domain} domain`,
      content: `When working in the ${obs.domain} domain, follow the approach: ${guide.plan[0]?.action ?? "plan first"}. ${reasoning}`,
      tags: [obs.domain.toLowerCase(), ...obs.keywords.slice(0, 3)],
      source: `run:${context.runId}`,
    });

    // Lesson from blocked actions (if any)
    if (impl.blocked.length > 0) {
      candidateLessons.push({
        title: "Permission boundaries learned",
        content: `Some actions were blocked: ${impl.blocked.join("; ")}. In future runs, ensure permissions are appropriate before attempting restricted actions.`,
        tags: ["safety", "permissions"],
        source: `run:${context.runId}`,
      });
    }

    const growthAreas: string[] = [];
    if (impl.blocked.length > 0) growthAreas.push("Understanding permission boundaries");
    if (guide.estimatedComplexity === "high") growthAreas.push("Handling complex tasks");
    growthAreas.push("Expanding domain knowledge");

    return {
      agent: "Learner",
      reflection: `Completed a ${guide.estimatedComplexity} complexity task in the ${obs.domain} domain. ${impl.actions.length} actions proposed, ${impl.blocked.length} blocked. ${reasoning}`,
      candidateLessons,
      growthAreas,
      currentLevel: this.level,
      questionsForNextTime: [
        `How can I improve my approach to ${obs.domain} tasks?`,
        "What patterns should I recognise faster?",
      ],
      timestamp: new Date().toISOString(),
    };
  }
}

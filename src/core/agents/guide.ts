import type { LLMProvider } from "../../providers/llm-provider.js";
import type { GuideOutput, GuideStep, PipelineContext } from "../schemas/index.js";

/**
 * Guide Agent
 * Creates a step-by-step plan based on the problem decomposition.
 * Incorporates retrieved lessons, playbooks, and previous improvements.
 */
export class Guide {
  constructor(private readonly llm: LLMProvider) {}

  async run(_input: string, context: PipelineContext): Promise<GuideOutput> {
    const crux = context.cruxFinder;
    if (!crux) {
      throw new Error("Guide requires CruxFinder output in context");
    }

    await this.llm.generate(
      "Guide: Create an execution plan.",
      JSON.stringify({
        coreProblem: crux.coreProblem,
        subProblems: crux.subProblems,
        retrievedLessons: context.retriever?.lessons?.length ?? 0,
        previousImprovements: context.previousImprovements?.length ?? 0,
      }),
    );

    const steps: GuideStep[] = crux.subProblems.map((sub: string, i: number) => ({
      stepNumber: i + 1,
      action: sub,
      rationale: `Addresses sub-problem: ${sub}`,
      expectedOutput: `Completed: ${sub}`,
    }));

    // Add a final verification step
    steps.push({
      stepNumber: steps.length + 1,
      action: "Verify all sub-problems are resolved",
      rationale: "Ensure completeness and correctness",
      expectedOutput: "All checks pass",
    });

    const complexity =
      crux.subProblems.length > 5 ? "high" : crux.subProblems.length > 2 ? "medium" : "low";

    // Build best practices from retrieved lessons and previous improvements
    const bestPractices: string[] = [];

    // Incorporate lessons from Retriever
    if (context.retriever) {
      for (const lesson of context.retriever.lessons.slice(0, 3)) {
        bestPractices.push(`Lesson: ${lesson}`);
      }
    }

    // Incorporate Gatekeeper improvements from previous runs
    if (context.previousImprovements) {
      for (const improvement of context.previousImprovements.slice(0, 3)) {
        bestPractices.push(`Improvement: ${improvement}`);
      }
    }

    // Default best practice if none retrieved
    if (bestPractices.length === 0) {
      bestPractices.push("Follow established project conventions");
    }

    return {
      agent: "Guide",
      plan: steps,
      estimatedComplexity: complexity,
      warnings: crux.constraints,
      bestPractices,
      timestamp: new Date().toISOString(),
    };
  }
}

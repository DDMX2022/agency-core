import type { LLMProvider } from "../../providers/llm-provider.js";
import type { PlannerOutput, PlannerTask, PipelineContext } from "../schemas/index.js";

/**
 * Planner (Task Decomposer) Agent
 * Converts Guide strategy into a structured task graph with
 * verification criteria, ownership, and dependencies.
 */
export class Planner {
  constructor(private readonly llm: LLMProvider) {}

  async run(_input: string, context: PipelineContext): Promise<PlannerOutput> {
    const guide = context.guide;
    const crux = context.cruxFinder;
    if (!guide || !crux) {
      throw new Error("Planner requires Guide and CruxFinder output in context");
    }

    await this.llm.generate(
      "Planner: Decompose guidance into executable tasks.",
      JSON.stringify({ plan: guide.plan, subProblems: crux.subProblems }),
    );

    const tasks: PlannerTask[] = guide.plan.map((step, idx) => {
      const taskId = `task-${String(idx + 1).padStart(3, "0")}`;
      const isVerification = step.action.toLowerCase().includes("verify");
      const owner = isVerification ? "qa" as const : "implementor" as const;

      // Build concrete steps from the plan step
      const steps = [
        `Analyse: ${step.rationale}`,
        `Execute: ${step.action}`,
        `Verify: ${step.expectedOutput}`,
      ];

      // Build definition of done
      const definitionOfDone = [
        step.expectedOutput,
        "No errors or warnings",
      ];

      // Dependencies: each task depends on the previous (simple linear chain)
      const dependencies = idx > 0 ? [`task-${String(idx).padStart(3, "0")}`] : [];

      return {
        id: taskId,
        title: step.action.slice(0, 80),
        description: `Step ${step.stepNumber}: ${step.action}. Rationale: ${step.rationale}`,
        owner,
        steps,
        definitionOfDone,
        dependencies,
      };
    });

    return {
      agent: "Planner",
      tasks,
      timestamp: new Date().toISOString(),
    };
  }
}

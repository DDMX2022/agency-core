import type { LLMProvider } from "../../providers/llm-provider.js";
import type { CruxFinderOutput, PipelineContext } from "../schemas/index.js";

/**
 * CruxFinder (Understanding Agent)
 * Breaks the task into core problem, sub-problems, assumptions, and constraints.
 */
export class CruxFinder {
  constructor(private readonly llm: LLMProvider) {}

  async run(_input: string, context: PipelineContext): Promise<CruxFinderOutput> {
    const obs = context.observer;
    const pat = context.patternObserver;
    if (!obs || !pat) {
      throw new Error("CruxFinder requires Observer and PatternObserver output");
    }

    await this.llm.generate(
      "CruxFinder: Decompose the problem into sub-parts.",
      obs.summary,
    );

    const keywords = obs.keywords;
    const subProblems = keywords.map((kw: string) => `Implement ${kw} component`);

    return {
      agent: "CruxFinder",
      coreProblem: `Implement: ${obs.summary.slice(0, 120)}`,
      subProblems: subProblems.length > 0 ? subProblems : ["Implement the requested feature"],
      assumptions: [
        "TypeScript/Node.js environment available",
        "Standard file system access permitted",
      ],
      constraints: [
        `Domain: ${obs.domain}`,
        "Must follow safety permissions policy",
      ],
      requiredKnowledge: keywords.map((kw: string) => `Knowledge of ${kw}`),
      timestamp: new Date().toISOString(),
    };
  }
}

import type { LLMProvider } from "../../providers/llm-provider.js";
import type { PatternObserverOutput, PipelineContext } from "../schemas/index.js";

/**
 * PatternObserver Agent
 * Looks for recurring patterns, similar past tasks, and suggests an approach.
 */
export class PatternObserver {
  constructor(private readonly llm: LLMProvider) {}

  async run(_input: string, context: PipelineContext): Promise<PatternObserverOutput> {
    const observerOut = context.observer;
    if (!observerOut) {
      throw new Error("PatternObserver requires Observer output in context");
    }

    const reasoning = await this.llm.generate(
      "PatternObserver: Identify patterns and prior art.",
      JSON.stringify({ summary: observerOut.summary, keywords: observerOut.keywords }),
    );

    const patterns = observerOut.keywords.map((kw, i) => ({
      name: `${kw}-pattern`,
      description: `Pattern related to "${kw}" – ${reasoning.slice(0, 60)}`,
      confidence: Math.max(0.5, 1 - i * 0.1),
    }));

    return {
      agent: "PatternObserver",
      patterns: patterns.length > 0 ? patterns : [{ name: "general", description: "General task pattern", confidence: 0.5 }],
      similarPastTasks: [],
      suggestedApproach: `Based on domain "${observerOut.domain}" and ${observerOut.keywords.length} keywords, use a structured implementation approach.`,
      timestamp: new Date().toISOString(),
    };
  }
}

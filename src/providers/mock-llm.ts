import type { LLMProvider } from "./llm-provider.js";

/**
 * MockLLM – a deterministic provider that echoes structured responses.
 * Used for testing and development without any API keys.
 *
 * It parses the systemPrompt to determine which agent is calling,
 * then returns a canned response so the pipeline can run end-to-end.
 */
export class MockLLM implements LLMProvider {
  readonly name = "MockLLM";

  async generate(systemPrompt: string, userMessage: string): Promise<string> {
    // Detect Gatekeeper scoring request and return varied JSON scores
    if (
      systemPrompt.includes("quality evaluator") &&
      systemPrompt.includes('"correctness"')
    ) {
      // Return varied but valid scores based on a simple hash of the request
      const seed = userMessage.length % 5;
      const scores = [
        { correctness: 4, verification: 3, safety: 5, clarity: 4, autonomy: 3 }, // 19
        { correctness: 3, verification: 4, safety: 4, clarity: 3, autonomy: 4 }, // 18
        { correctness: 5, verification: 4, safety: 5, clarity: 5, autonomy: 4 }, // 23
        { correctness: 2, verification: 3, safety: 5, clarity: 3, autonomy: 2 }, // 15
        { correctness: 4, verification: 5, safety: 4, clarity: 4, autonomy: 5 }, // 22
      ];
      return JSON.stringify(scores[seed]);
    }

    // Default: return a reasoning string for other agents
    const agentHint = systemPrompt.split("\n")[0] ?? "Agent";
    return `[${this.name}] Reasoning for ${agentHint}: Analysing "${userMessage.slice(0, 80)}"`;
  }
}

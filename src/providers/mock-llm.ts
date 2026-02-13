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
    // The mock simply returns a reasoning string that agents can embed
    // in their structured output. The actual structured output is built
    // deterministically by each agent's `run` method.
    const agentHint = systemPrompt.split("\n")[0] ?? "Agent";
    return `[${this.name}] Reasoning for ${agentHint}: Analysing "${userMessage.slice(0, 80)}"`;
  }
}

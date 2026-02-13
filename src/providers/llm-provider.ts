/**
 * LLMProvider interface – plug in any LLM backend.
 * The system ships with MockLLM; swap for OpenAI/Gemini/Ollama later.
 */
export interface LLMProvider {
  readonly name: string;

  /**
   * Generate a text completion given a system prompt and a user message.
   * Returns the raw text response from the LLM.
   */
  generate(systemPrompt: string, userMessage: string): Promise<string>;
}

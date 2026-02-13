/**
 * Provider factory – auto-detects which LLM backend to use.
 *
 * Priority:
 *   1. OPENAI_API_KEY set → OpenAI provider
 *   2. Fallback → MockLLM (safe for tests / offline dev)
 *
 * Usage:
 *   import { createLLMProvider } from "../providers/index.js";
 *   const llm = createLLMProvider();
 */
export { MockLLM } from "./mock-llm.js";
export { OpenAILLM } from "./openai-llm.js";
export type { LLMProvider } from "./llm-provider.js";

import type { LLMProvider } from "./llm-provider.js";
import { MockLLM } from "./mock-llm.js";
import { OpenAILLM } from "./openai-llm.js";

export function createLLMProvider(options?: {
  forceProvider?: "openai" | "mock";
  model?: string;
}): LLMProvider {
  // Explicit override
  if (options?.forceProvider === "mock") {
    return new MockLLM();
  }

  if (options?.forceProvider === "openai") {
    return new OpenAILLM({ model: options.model });
  }

  // Auto-detect from environment
  if (process.env["OPENAI_API_KEY"]) {
    return new OpenAILLM({ model: options?.model });
  }

  // Fallback
  return new MockLLM();
}

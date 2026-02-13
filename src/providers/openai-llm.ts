import OpenAI from "openai";
import type { LLMProvider } from "./llm-provider.js";

/**
 * OpenAI LLM provider – connects to GPT-4o (or any OpenAI model).
 *
 * Reads OPENAI_API_KEY from environment.
 * Configurable model via constructor (defaults to gpt-4o).
 */
export class OpenAILLM implements LLMProvider {
  readonly name: string;
  private client: OpenAI;
  private model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    const apiKey = options?.apiKey ?? process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is required. Set it in .env or pass via constructor."
      );
    }

    this.model = options?.model ?? "gpt-4o";
    this.name = `OpenAI/${this.model}`;
    this.client = new OpenAI({ apiKey });
  }

  async generate(systemPrompt: string, userMessage: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned an empty response");
    }

    return content;
  }
}

import type { LLMProvider } from "../../providers/llm-provider.js";
import type { ObserverOutput, PipelineContext } from "../schemas/index.js";

/**
 * Observer Agent
 * First in the pipeline. Receives raw user input, produces a structured
 * summary with keywords and domain classification.
 */
export class Observer {
  constructor(private readonly llm: LLMProvider) {}

  async run(input: string, _context: PipelineContext): Promise<ObserverOutput> {
    const reasoning = await this.llm.generate(
      "Observer: You observe and summarise the user request.",
      input,
    );

    const keywords = extractKeywords(input);
    const domain = classifyDomain(input);

    return {
      agent: "Observer",
      summary: `Task request: ${input.slice(0, 200)}. ${reasoning}`,
      keywords,
      domain,
      rawInput: input,
      timestamp: new Date().toISOString(),
    };
  }
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "a", "an", "the", "and", "or", "but", "is", "are", "was", "were",
    "to", "of", "in", "for", "on", "with", "at", "by", "from", "it",
    "this", "that", "be", "have", "do", "will", "can", "create", "make",
  ]);
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
  return [...new Set(words)].slice(0, 10);
}

function classifyDomain(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("test") || lower.includes("spec") || lower.includes("qa")) return "QA";
  if (lower.includes("design") || lower.includes("css") || lower.includes("ui")) return "Design";
  if (lower.includes("deploy") || lower.includes("ci") || lower.includes("docker")) return "DevOps";
  return "Dev";
}

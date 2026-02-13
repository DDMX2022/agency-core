import * as fs from "node:fs/promises";
import pino from "pino";
import type { LLMProvider } from "../providers/llm-provider.js";
import type { Weakness } from "./analyst.js";

const logger = pino({ name: "self-improve-coder" });

/**
 * CodePatch — a single file modification produced by the Coder.
 */
export interface CodePatch {
  filePath: string;
  original: string;
  patched: string;
  explanation: string;
  targetDimension: string;
}

/**
 * Coder
 * Takes weaknesses identified by the Analyst and uses the LLM to generate
 * targeted code improvements to the AgencyCore source files.
 */
export class Coder {
  constructor(
    private readonly llm: LLMProvider,
    private readonly workspaceRoot: string,
  ) {}

  /**
   * Generate code patches for the given weaknesses.
   * Processes at most `maxPatches` weaknesses per run (default 2).
   */
  async generatePatches(weaknesses: Weakness[], maxPatches?: number): Promise<CodePatch[]> {
    const limit = maxPatches ?? 2;
    const patches: CodePatch[] = [];

    for (const weakness of weaknesses.slice(0, limit)) {
      try {
        const patch = await this.patchForWeakness(weakness);
        if (patch) {
          patches.push(patch);
          logger.info(
            { dimension: weakness.dimension, file: weakness.likelyCause },
            "Generated patch",
          );
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn({ dimension: weakness.dimension, error: msg }, "Failed to generate patch");
      }
    }

    return patches;
  }

  private async patchForWeakness(weakness: Weakness): Promise<CodePatch | null> {
    const filePath = `${this.workspaceRoot}/${weakness.likelyCause}`;

    let original: string;
    try {
      original = await fs.readFile(filePath, "utf-8");
    } catch {
      logger.warn({ filePath }, "Source file not found, skipping");
      return null;
    }

    const systemPrompt = `You are an expert TypeScript developer improving the AgencyCore multi-agent system.

TASK: Improve the "${weakness.dimension}" score (currently ${weakness.averageScore}/5).

RULES:
1. Return ONLY the complete improved file content — no markdown, no explanation, no backticks.
2. Keep ALL existing imports, exports, class names, and method signatures.
3. Do NOT remove any existing functionality.
4. Make targeted improvements based on the suggestion below.
5. The code must be valid TypeScript that compiles without errors.
6. Keep the same file structure and patterns.

WEAKNESS: ${weakness.dimension} (avg ${weakness.averageScore}/5)
SUGGESTION: ${weakness.suggestion}
LIKELY FILE: ${weakness.likelyCause}`;

    const userMessage = `Here is the current source code:\n\n${original}`;

    const patched = await this.llm.generate(systemPrompt, userMessage);

    // Basic sanity checks
    if (!patched || patched.length < 50) {
      logger.warn({ dimension: weakness.dimension }, "LLM returned too-short response");
      return null;
    }

    // Strip any markdown code fences the LLM might have added
    const cleaned = stripCodeFences(patched);

    // Must still have key structural elements
    if (!cleaned.includes("export")) {
      logger.warn({ dimension: weakness.dimension }, "Patched code missing exports");
      return null;
    }

    // Don't accept if it's identical
    if (cleaned.trim() === original.trim()) {
      logger.info({ dimension: weakness.dimension }, "No changes needed");
      return null;
    }

    return {
      filePath,
      original,
      patched: cleaned,
      explanation: `Improve ${weakness.dimension} score (${weakness.averageScore}/5 → target 4+/5): ${weakness.suggestion.slice(0, 120)}`,
      targetDimension: weakness.dimension,
    };
  }
}

/** Strip ```typescript ... ``` or ```ts ... ``` wrappers. */
function stripCodeFences(code: string): string {
  let cleaned = code.trim();
  // Remove opening fence
  cleaned = cleaned.replace(/^```(?:typescript|ts|javascript|js)?\s*\n?/i, "");
  // Remove closing fence
  cleaned = cleaned.replace(/\n?```\s*$/i, "");
  return cleaned.trim();
}

export { stripCodeFences };

import type { LLMProvider } from "../../providers/llm-provider.js";
import type { RetrieverOutput, PipelineContext } from "../schemas/index.js";
import type { MemoryManager, LessonFile } from "../memory/index.js";

/**
 * Retriever Agent
 * Fetches relevant lessons and playbooks from memory before planning.
 * Uses simple keyword matching (no vector DB – extensible later).
 */
export class Retriever {
  constructor(
    private readonly llm: LLMProvider,
    private readonly memory: MemoryManager,
  ) {}

  async run(_input: string, context: PipelineContext): Promise<RetrieverOutput> {
    const crux = context.cruxFinder;
    const patterns = context.patternObserver;
    if (!crux || !patterns) {
      throw new Error("Retriever requires CruxFinder and PatternObserver output in context");
    }

    await this.llm.generate(
      "Retriever: Search memory for relevant knowledge.",
      JSON.stringify({ coreProblem: crux.coreProblem, patterns: patterns.patterns.map((p) => p.name) }),
    );

    // Gather search keywords from crux + patterns + observer
    const searchTerms: string[] = [
      ...crux.subProblems,
      ...crux.requiredKnowledge,
      ...(context.observer?.keywords ?? []),
      ...patterns.patterns.map((p) => p.name),
    ].map((t) => t.toLowerCase());

    // Search lessons
    const allLessons = await this.memory.listLessons();
    const matchedLessons = this.rankByRelevance(allLessons, searchTerms).slice(0, 5);

    // Search playbooks
    const allPlaybooks = await this.memory.listPlaybooks();
    const matchedPlaybooks = this.rankStringsByRelevance(allPlaybooks, searchTerms).slice(0, 3);

    // Examples from portfolio
    const portfolio = await this.memory.listPortfolio();
    const examples = portfolio
      .filter((p) => p.totalScore >= 15)
      .slice(0, 3)
      .map((p) => `Run ${p.runId}: "${p.request}" (score: ${p.totalScore}/25)`);

    return {
      agent: "Retriever",
      lessons: matchedLessons.map((l) => `[${l.title}] ${l.content}`),
      playbooks: matchedPlaybooks,
      examples,
      timestamp: new Date().toISOString(),
    };
  }

  /** Rank lessons by number of keyword matches in title + content + tags. */
  private rankByRelevance(lessons: LessonFile[], terms: string[]): LessonFile[] {
    const scored = lessons.map((lesson) => {
      const haystack = [lesson.title, lesson.content, ...lesson.tags].join(" ").toLowerCase();
      const score = terms.reduce((acc, term) => acc + (haystack.includes(term) ? 1 : 0), 0);
      return { lesson, score };
    });
    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.lesson);
  }

  /** Rank raw strings by keyword overlap. */
  private rankStringsByRelevance(items: string[], terms: string[]): string[] {
    const scored = items.map((item) => {
      const lower = item.toLowerCase();
      const score = terms.reduce((acc, term) => acc + (lower.includes(term) ? 1 : 0), 0);
      return { item, score };
    });
    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.item);
  }
}

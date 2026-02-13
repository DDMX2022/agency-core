import * as fs from "node:fs/promises";
import pino from "pino";
import { Analyst, type AnalysisReport } from "./analyst.js";
import { Coder, type CodePatch } from "./coder.js";
import { Validator, type ValidationResult } from "./validator.js";
import { AutoGit, type GitResult } from "./autoGit.js";
import type { MemoryManager } from "../core/memory/index.js";
import type { LLMProvider } from "../providers/llm-provider.js";

const logger = pino({ name: "self-improve-loop" });

/**
 * ImprovementResult — full output of one self-improvement cycle.
 */
export interface ImprovementResult {
  /** Did the cycle produce and push working improvements? */
  success: boolean;
  /** Analysis of past runs. */
  analysis: AnalysisReport;
  /** Code patches generated. */
  patches: CodePatch[];
  /** Test validation result. */
  validation: ValidationResult | null;
  /** Git push result. */
  git: GitResult | null;
  /** What went wrong (if anything). */
  error?: string;
  /** Human-readable summary. */
  summary: string;
  timestamp: string;
}

export interface ImprovementLoopConfig {
  llm: LLMProvider;
  memory: MemoryManager;
  workspaceRoot: string;
  /** Maximum patches per cycle (default 2). */
  maxPatches?: number;
  /** Minimum portfolio runs before attempting improvement (default 1). */
  minRuns?: number;
  /** Enable git push (default true). Set false for dry-run. */
  enableGitPush?: boolean;
}

/**
 * ImprovementLoop
 *
 * The self-improvement cycle:
 *   1. ANALYZE — Read portfolio, find weak scorecard dimensions
 *   2. CODE    — Use LLM to generate targeted fixes to weak agents
 *   3. TEST    — Run vitest, ensure nothing breaks
 *   4. PUSH    — If tests pass, branch → commit → push → merge
 *   5. REVERT  — If tests fail, restore original files
 *
 * Safety guardrails:
 *   - Only modifies files under src/core/agents/
 *   - Always runs tests before pushing
 *   - Creates a feature branch (never force-pushes main)
 *   - Keeps backups of original files
 *   - Maximum 2 patches per cycle
 *   - Requires minimum portfolio data before acting
 */
export class ImprovementLoop {
  private readonly analyst: Analyst;
  private readonly coder: Coder;
  private readonly validator: Validator;
  private readonly autoGit: AutoGit;
  private readonly maxPatches: number;
  private readonly minRuns: number;
  private readonly enableGitPush: boolean;
  private readonly workspaceRoot: string;

  /** Prevent concurrent runs. */
  private running = false;

  constructor(config: ImprovementLoopConfig) {
    this.analyst = new Analyst(config.memory);
    this.coder = new Coder(config.llm, config.workspaceRoot);
    this.validator = new Validator(config.workspaceRoot);
    this.autoGit = new AutoGit(config.workspaceRoot);
    this.maxPatches = config.maxPatches ?? 2;
    this.minRuns = config.minRuns ?? 1;
    this.enableGitPush = config.enableGitPush ?? true;
    this.workspaceRoot = config.workspaceRoot;
  }

  /** Is a cycle currently running? */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Execute one self-improvement cycle.
   * Returns a full result with analysis, patches, test results, and git status.
   */
  async runCycle(): Promise<ImprovementResult> {
    if (this.running) {
      return this.result(false, "A self-improvement cycle is already running.");
    }

    this.running = true;
    logger.info("═══ Self-Improvement Cycle Started ═══");

    try {
      // ── Step 1: ANALYZE ─────────────────────────────────────
      logger.info("Step 1/4: Analyzing portfolio...");
      const analysis = await this.analyst.analyze(this.minRuns);

      if (analysis.weaknesses.length === 0) {
        logger.info("No weaknesses found — all scores are healthy!");
        return this.result(
          true,
          `All dimensions are healthy (avg ${analysis.averageTotalScore}/25 across ${analysis.totalRuns} runs). No improvements needed.`,
          { analysis },
        );
      }

      logger.info(
        { weaknesses: analysis.weaknesses.map((w) => `${w.dimension}:${w.averageScore}`) },
        "Weaknesses identified",
      );

      // ── Step 2: CODE ────────────────────────────────────────
      logger.info("Step 2/4: Generating code patches...");
      const patches = await this.coder.generatePatches(analysis.weaknesses, this.maxPatches);

      if (patches.length === 0) {
        return this.result(
          false,
          `Found ${analysis.weaknesses.length} weakness(es) but could not generate valid patches.`,
          { analysis },
        );
      }

      // Apply patches (and keep backups)
      const backups = new Map<string, string>();
      for (const patch of patches) {
        backups.set(patch.filePath, patch.original);
        await fs.writeFile(patch.filePath, patch.patched, "utf-8");
        logger.info({ file: patch.filePath, dim: patch.targetDimension }, "Patch applied");
      }

      // ── Step 3: TEST ────────────────────────────────────────
      logger.info("Step 3/4: Running tests...");
      const validation = this.validator.run();

      if (!validation.passed) {
        // REVERT — restore all originals
        logger.warn({ failed: validation.failedTests }, "Tests failed — reverting patches");
        for (const [filePath, original] of backups) {
          await fs.writeFile(filePath, original, "utf-8");
          logger.info({ file: filePath }, "Reverted");
        }

        return this.result(
          false,
          `Generated ${patches.length} patch(es) but tests failed (${validation.failedTests} failures). All changes reverted.`,
          { analysis, patches, validation },
        );
      }

      logger.info({ total: validation.totalTests }, "All tests passed!");

      // ── Step 4: PUSH ────────────────────────────────────────
      let git: GitResult | null = null;

      if (this.enableGitPush) {
        logger.info("Step 4/4: Pushing to GitHub...");
        const dimensions = patches.map((p) => p.targetDimension);
        const commitMessage =
          `refactor(self-improve): improve ${dimensions.join(", ")} scores\n\n` +
          patches.map((p) => `- ${p.explanation}`).join("\n") +
          `\n\n${validation.totalTests} tests passing`;

        git = this.autoGit.fullWorkflow(dimensions, commitMessage);

        if (!git.success) {
          return this.result(
            false,
            `Patches applied and tests pass, but git push failed: ${git.error}`,
            { analysis, patches, validation, git },
          );
        }
      } else {
        logger.info("Step 4/4: Git push disabled (dry-run mode)");
      }

      // ── SUCCESS ─────────────────────────────────────────────
      const dims = patches.map((p) => p.targetDimension).join(", ");
      const summary =
        `✅ Self-improvement cycle complete!\n` +
        `  Improved: ${dims}\n` +
        `  Patches: ${patches.length}\n` +
        `  Tests: ${validation.totalTests} passing\n` +
        (git ? `  Commit: ${git.commitHash}\n  Branch: ${git.branch}` : `  Mode: dry-run`);

      logger.info(summary);

      return {
        success: true,
        analysis,
        patches,
        validation,
        git,
        summary,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, "Self-improvement cycle failed");
      return this.result(false, `Cycle failed: ${msg}`);
    } finally {
      this.running = false;
      logger.info("═══ Self-Improvement Cycle Ended ═══");
    }
  }

  /** Helper to build a result object. */
  private result(
    success: boolean,
    summary: string,
    extras?: Partial<ImprovementResult>,
  ): ImprovementResult {
    return {
      success,
      analysis: extras?.analysis ?? {
        totalRuns: 0,
        averageTotalScore: 0,
        bestScore: 0,
        worstScore: 0,
        weaknesses: [],
        timestamp: new Date().toISOString(),
      },
      patches: extras?.patches ?? [],
      validation: extras?.validation ?? null,
      git: extras?.git ?? null,
      summary,
      timestamp: new Date().toISOString(),
    };
  }
}

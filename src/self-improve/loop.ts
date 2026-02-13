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
  /** Is this result waiting for push approval? */
  pendingApproval: boolean;
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
 *   4. PAUSE   — Wait for explicit human approval before pushing
 *   5. PUSH    — If approved, branch → commit → push → merge
 *   6. REVERT  — If rejected or tests fail, restore original files
 *
 * Safety guardrails:
 *   - Only modifies files under src/core/agents/
 *   - Always runs tests before pushing
 *   - **Never pushes without explicit human approval**
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

  /** State held between analyze+test and push-approval. */
  private pendingResult: ImprovementResult | null = null;
  private pendingBackups: Map<string, string> = new Map();

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

  /** Is there a pending result waiting for push approval? */
  hasPendingApproval(): boolean {
    return this.pendingResult !== null && this.pendingResult.pendingApproval;
  }

  /**
   * Execute steps 1-3: Analyze → Code → Test.
   * If patches pass tests, the result has pendingApproval=true.
   * Call approvePush() or rejectPush() to finalize.
   */
  async runCycle(): Promise<ImprovementResult> {
    if (this.running) {
      return this.result(false, "A self-improvement cycle is already running.");
    }

    this.running = true;
    this.pendingResult = null;
    this.pendingBackups.clear();
    logger.info("═══ Self-Improvement Cycle Started ═══");

    try {
      // ── Step 1: ANALYZE ─────────────────────────────────────
      logger.info("Step 1/3: Analyzing portfolio...");
      const analysis = await this.analyst.analyze(this.minRuns);

      if (analysis.weaknesses.length === 0) {
        logger.info("No weaknesses found — all scores are healthy!");
        this.running = false;
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
      logger.info("Step 2/3: Generating code patches...");
      const patches = await this.coder.generatePatches(analysis.weaknesses, this.maxPatches);

      if (patches.length === 0) {
        this.running = false;
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
      logger.info("Step 3/3: Running tests...");
      const validation = this.validator.run();

      if (!validation.passed) {
        // REVERT — restore all originals
        logger.warn({ failed: validation.failedTests }, "Tests failed — reverting patches");
        for (const [filePath, original] of backups) {
          await fs.writeFile(filePath, original, "utf-8");
          logger.info({ file: filePath }, "Reverted");
        }

        this.running = false;
        return this.result(
          false,
          `Generated ${patches.length} patch(es) but tests failed (${validation.failedTests} failures). All changes reverted.`,
          { analysis, patches, validation },
        );
      }

      logger.info({ total: validation.totalTests }, "All tests passed!");

      // ── PAUSE — Wait for approval ──────────────────────────
      if (!this.enableGitPush) {
        logger.info("Git push disabled (dry-run mode). Cycle complete.");
        this.running = false;
        return this.result(
          true,
          `Dry-run complete: ${patches.length} patch(es), ${validation.totalTests} tests passing. Git push disabled.`,
          { analysis, patches, validation },
        );
      }

      // Store pending state for approval
      const pendingResult: ImprovementResult = {
        success: false, // not yet — needs approval
        analysis,
        patches,
        validation,
        git: null,
        summary: `✅ ${patches.length} patch(es) applied, ${validation.totalTests} tests passing.\n⏳ Awaiting your approval to push to GitHub.`,
        timestamp: new Date().toISOString(),
        pendingApproval: true,
      };

      this.pendingResult = pendingResult;
      this.pendingBackups = backups;
      // Note: running stays true until approval/rejection clears it
      logger.info("Patches applied & tests pass — awaiting push approval");

      return pendingResult;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, "Self-improvement cycle failed");
      this.running = false;
      return this.result(false, `Cycle failed: ${msg}`);
    }
  }

  /**
   * Approve the pending push — commits and pushes to GitHub.
   * Only works if there is a pendingApproval result.
   */
  async approvePush(): Promise<ImprovementResult> {
    if (!this.pendingResult || !this.pendingResult.pendingApproval) {
      return this.result(false, "No pending improvements to push.");
    }

    const { analysis, patches, validation } = this.pendingResult;

    try {
      logger.info("Push approved — committing and pushing to GitHub...");

      const dimensions = patches.map((p) => p.targetDimension);
      const commitMessage =
        `refactor(self-improve): improve ${dimensions.join(", ")} scores\n\n` +
        patches.map((p) => `- ${p.explanation}`).join("\n") +
        `\n\n${validation!.totalTests} tests passing`;

      const git = this.autoGit.fullWorkflow(dimensions, commitMessage);

      if (!git.success) {
        return this.result(
          false,
          `Patches applied and tests pass, but git push failed: ${git.error}`,
          { analysis, patches, validation, git },
        );
      }

      const dims = patches.map((p) => p.targetDimension).join(", ");
      const summary =
        `✅ Self-improvement cycle complete!\n` +
        `  Improved: ${dims}\n` +
        `  Patches: ${patches.length}\n` +
        `  Tests: ${validation!.totalTests} passing\n` +
        `  Commit: ${git.commitHash}\n  Branch: ${git.branch}`;

      logger.info(summary);

      return {
        success: true,
        analysis,
        patches,
        validation,
        git,
        summary,
        timestamp: new Date().toISOString(),
        pendingApproval: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, "Push failed after approval");
      return this.result(false, `Push failed: ${msg}`, { analysis, patches, validation });
    } finally {
      this.clearPending();
    }
  }

  /**
   * Reject the pending push — reverts all patched files.
   */
  async rejectPush(): Promise<ImprovementResult> {
    if (!this.pendingResult || !this.pendingResult.pendingApproval) {
      return this.result(false, "No pending improvements to reject.");
    }

    const { analysis, patches, validation } = this.pendingResult;

    logger.warn("Push rejected — reverting all patches");
    for (const [filePath, original] of this.pendingBackups) {
      await fs.writeFile(filePath, original, "utf-8");
      logger.info({ file: filePath }, "Reverted");
    }

    const summary = `🚫 Push rejected. ${patches.length} patch(es) reverted.`;
    logger.info(summary);
    this.clearPending();

    return this.result(false, summary, { analysis, patches, validation });
  }

  /** Clear pending state and unlock. */
  private clearPending(): void {
    this.pendingResult = null;
    this.pendingBackups.clear();
    this.running = false;
    logger.info("═══ Self-Improvement Cycle Ended ═══");
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
      pendingApproval: false,
    };
  }
}

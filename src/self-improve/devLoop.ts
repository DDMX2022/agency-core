import pino from "pino";
import type { Orchestrator } from "../core/pipeline/orchestrator.js";
import type { PromotionEngine, PromotionEvent } from "../core/promotion/index.js";
import { LEVEL_TITLES } from "../core/promotion/index.js";
import { ProjectDeployer, type DeployResult } from "../core/deployer/index.js";
import { ImprovementLoop, type ImprovementResult } from "./loop.js";
import type { LLMProvider } from "../providers/llm-provider.js";

const logger = pino({ name: "dev-loop" });

/**
 * DevLoopIterationResult — outcome of a single iteration.
 */
export interface DevLoopIteration {
  iteration: number;
  pipelineScore: number | null;
  improvement: ImprovementResult | null;
  deploy: DeployResult | null;
  promotion: PromotionEvent | null;
  level: number;
  levelTitle: string;
  summary: string;
  timestamp: string;
}

/**
 * DevLoopResult — outcome of a full dev-loop session.
 */
export interface DevLoopResult {
  iterations: DevLoopIteration[];
  finalLevel: number;
  finalTitle: string;
  totalRuns: number;
  started: string;
  finished: string;
  summary: string;
}

export interface DevLoopConfig {
  orchestrator: Orchestrator;
  llm: LLMProvider;
  workspaceRoot: string;
  /** Max iterations per session (default 5). Safety cap. */
  maxIterations?: number;
  /** Stop when this level is reached (default: keep going to max). */
  targetLevel?: number;
  /** Auto-deploy after each successful pipeline run (default true). */
  autoDeploy?: boolean;
  /** Auto self-improve after each run (default true). */
  autoImprove?: boolean;
  /** GitHub owner for deploys. */
  githubOwner?: string;
}

/**
 * DevLoop — Continuous self-improvement loop.
 *
 * Each iteration:
 *   1. Run the 11-agent pipeline with a training prompt
 *   2. Record score → PromotionEngine checks for level-up
 *   3. Self-improve (analyze weaknesses, patch, test)
 *   4. Deploy generated project to GitHub
 *   5. Check if target level reached → stop or continue
 *
 * The agent starts as a Junior Developer (L1) and earns promotions
 * through consistent quality, successful deploys, and self-improvement.
 */
export class DevLoop {
  private readonly orchestrator: Orchestrator;
  private readonly improvementLoop: ImprovementLoop;
  private readonly deployer: ProjectDeployer;
  private readonly promotion: PromotionEngine | null;
  private readonly maxIterations: number;
  private readonly targetLevel: number;
  private readonly autoDeploy: boolean;
  private readonly autoImprove: boolean;
  private running = false;
  private aborted = false;

  /** Callback for progress reporting (e.g. Telegram updates). */
  onProgress?: (iteration: DevLoopIteration) => void | Promise<void>;

  constructor(config: DevLoopConfig) {
    this.orchestrator = config.orchestrator;
    this.improvementLoop = new ImprovementLoop({
      llm: config.llm,
      memory: config.orchestrator.getMemory(),
      workspaceRoot: config.workspaceRoot,
      maxPatches: 2,
      minRuns: 1,
      enableGitPush: true,
    });
    this.deployer = new ProjectDeployer(config.githubOwner);
    this.promotion = config.orchestrator.getPromotion();
    this.maxIterations = config.maxIterations ?? 5;
    this.targetLevel = config.targetLevel ?? 3;
    this.autoDeploy = config.autoDeploy ?? true;
    this.autoImprove = config.autoImprove ?? true;
  }

  isRunning(): boolean {
    return this.running;
  }

  abort(): void {
    this.aborted = true;
  }

  /**
   * Run the dev loop — iterate until target level or max iterations.
   */
  async run(): Promise<DevLoopResult> {
    if (this.running) {
      return {
        iterations: [],
        finalLevel: this.promotion?.getLevel() ?? 1,
        finalTitle: this.promotion?.getTitle() ?? "Unknown",
        totalRuns: 0,
        started: new Date().toISOString(),
        finished: new Date().toISOString(),
        summary: "Already running.",
      };
    }

    this.running = true;
    this.aborted = false;
    const started = new Date().toISOString();
    const iterations: DevLoopIteration[] = [];

    logger.info(
      { maxIterations: this.maxIterations, targetLevel: this.targetLevel },
      "=== DevLoop Started ===",
    );

    try {
      for (let i = 1; i <= this.maxIterations; i++) {
        if (this.aborted) {
          logger.info({ iteration: i }, "DevLoop aborted by user");
          break;
        }

        const currentLevel = this.promotion?.getLevel() ?? 1;
        if (currentLevel >= this.targetLevel) {
          logger.info(
            { level: currentLevel, title: LEVEL_TITLES[currentLevel as 0 | 1 | 2 | 3] },
            "Target level reached!",
          );
          break;
        }

        logger.info({ iteration: i, level: currentLevel }, `--- Iteration ${i} ---`);

        const iteration = await this.runIteration(i);
        iterations.push(iteration);

        // Report progress
        if (this.onProgress) {
          try {
            await this.onProgress(iteration);
          } catch (err) {
            logger.error({ error: err }, "Progress callback error");
          }
        }

        // Small delay between iterations to avoid hammering APIs
        if (i < this.maxIterations) {
          await sleep(2000);
        }
      }
    } finally {
      this.running = false;
    }

    const finalLevel = this.promotion?.getLevel() ?? 1;
    const finalTitle = this.promotion?.getTitle() ?? "Unknown";
    const finished = new Date().toISOString();

    const summary = [
      `DevLoop completed: ${iterations.length} iteration(s).`,
      `Final level: L${finalLevel} — ${finalTitle}`,
      `Pipeline runs: ${iterations.filter((i) => i.pipelineScore !== null).length}`,
      `Deploys: ${iterations.filter((i) => i.deploy?.success).length}`,
      `Promotions: ${iterations.filter((i) => i.promotion !== null).length}`,
    ].join("\n");

    logger.info({ iterations: iterations.length, finalLevel }, "=== DevLoop Finished ===");

    return {
      iterations,
      finalLevel,
      finalTitle,
      totalRuns: iterations.length,
      started,
      finished,
      summary,
    };
  }

  private async runIteration(num: number): Promise<DevLoopIteration> {
    let pipelineScore: number | null = null;
    let improvement: ImprovementResult | null = null;
    let deploy: DeployResult | null = null;
    let promotionEvent: PromotionEvent | null = null;

    // ── Step 1: Run pipeline with a training prompt ──
    try {
      const trainingPrompts = [
        "Build a TypeScript REST API for a todo app with CRUD endpoints",
        "Create a Node.js CLI tool that converts CSV to JSON",
        "Build a real-time chat server using WebSockets",
        "Create a markdown-to-HTML converter with syntax highlighting",
        "Build a rate limiter middleware for Express.js",
        "Create a file watcher that auto-compiles TypeScript",
        "Build a simple key-value store with TTL support",
        "Create a job queue system with retry logic",
        "Build a URL shortener API with analytics",
        "Create a plugin system with dynamic loading",
      ];
      const prompt = trainingPrompts[(num - 1) % trainingPrompts.length]!;

      logger.info({ iteration: num, prompt: prompt.slice(0, 60) }, "Running pipeline");
      const artifact = await this.orchestrator.run(prompt);
      pipelineScore = artifact.gatekeeper.totalScore;
      logger.info({ iteration: num, score: pipelineScore }, "Pipeline complete");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ iteration: num, error: msg }, "Pipeline failed");
    }

    // ── Step 2: Self-improve ──
    if (this.autoImprove && !this.improvementLoop.isRunning()) {
      try {
        logger.info({ iteration: num }, "Running self-improvement");
        improvement = await this.improvementLoop.runCycle();

        if (improvement.pendingApproval) {
          // Auto-approve in dev loop (the whole point is autonomous improvement)
          improvement = await this.improvementLoop.approvePush();
          if (improvement.success && this.promotion) {
            promotionEvent = await this.promotion.recordSelfImprove();
          }
        } else if (improvement.success && this.promotion) {
          promotionEvent = await this.promotion.recordSelfImprove();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ iteration: num, error: msg }, "Self-improvement failed");
      }
    }

    // ── Step 3: Deploy ──
    if (this.autoDeploy && pipelineScore !== null) {
      try {
        logger.info({ iteration: num }, "Deploying project");
        deploy = await this.deployer.deployFromWorkspace(
          (this.orchestrator as unknown as { workspaceRoot: string }).workspaceRoot,
        );
        if (deploy.success && this.promotion) {
          const deployPromotion = await this.promotion.recordDeploy();
          if (deployPromotion) promotionEvent = deployPromotion;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ iteration: num, error: msg }, "Deploy failed");
      }
    }

    const level = this.promotion?.getLevel() ?? 1;
    const levelTitle = this.promotion?.getTitle() ?? "Junior Developer";

    const parts: string[] = [];
    if (pipelineScore !== null) parts.push(`Score: ${pipelineScore}/25`);
    if (improvement?.success) parts.push("Self-improved");
    if (deploy?.success) parts.push(`Deployed: ${deploy.repoUrl}`);
    if (promotionEvent) parts.push(`PROMOTED to L${promotionEvent.toLevel}!`);
    parts.push(`Level: L${level} ${levelTitle}`);

    return {
      iteration: num,
      pipelineScore,
      improvement,
      deploy,
      promotion: promotionEvent,
      level,
      levelTitle,
      summary: parts.join(" | "),
      timestamp: new Date().toISOString(),
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import { v4 as uuidv4 } from "uuid";
import { ZodError } from "zod";
import pino from "pino";
import {
  ObserverOutputSchema,
  PatternObserverOutputSchema,
  CruxFinderOutputSchema,
  RetrieverOutputSchema,
  GuideOutputSchema,
  PlannerOutputSchema,
  SafetyGuardOutputSchema,
  ImplementorOutputSchema,
  ToolRunnerOutputSchema,
  LearnerOutputSchema,
  GatekeeperOutputSchema,
  RunArtifactSchema,
  type PipelineContext,
  type RunArtifact,
} from "../schemas/index.js";
import { Observer } from "../agents/observer.js";
import { PatternObserver } from "../agents/patternObserver.js";
import { CruxFinder } from "../agents/cruxFinder.js";
import { Retriever } from "../agents/retriever.js";
import { Guide } from "../agents/guide.js";
import { Planner } from "../agents/planner.js";
import { SafetyGuard } from "../agents/safetyGuard.js";
import { Implementor } from "../agents/implementor.js";
import { ToolRunner } from "../tools/toolRunner.js";
import { Learner } from "../agents/learner.js";
import { Gatekeeper } from "../agents/gatekeeper.js";
import { MemoryManager } from "../memory/index.js";
import type { LLMProvider } from "../../providers/llm-provider.js";
import {
  createDefaultPolicy,
  type PermissionPolicy,
} from "../permissions/index.js";

const logger = pino({ name: "orchestrator" });

export interface OrchestratorConfig {
  llm: LLMProvider;
  memoryDir: string;
  workspaceRoot: string;
  permissionPolicy?: PermissionPolicy;
  /** Enable mock-mode ToolRunner (default: true). */
  toolRunnerMockMode?: boolean;
}

/**
 * Pipeline Orchestrator
 * Runs all 11 agents in sequence:
 *   Observer → PatternObserver → CruxFinder → Retriever → Guide →
 *   Planner → SafetyGuard → Implementor → ToolRunner → Gatekeeper → Learner
 *
 * Feedback loops:
 *   - Gatekeeper → Learner (approve / reject lessons)
 *   - Gatekeeper → Implementor (permission level promotion)
 *   - Gatekeeper.improvements → Guide (previousImprovements on next run)
 *
 * Validates every agent output against its Zod schema.
 * Stores the final run artifact and portfolio entry to disk.
 */
export class Orchestrator {
  private readonly llm: LLMProvider;
  private readonly memory: MemoryManager;
  private readonly policy: PermissionPolicy;
  private readonly learner: Learner;
  private readonly workspaceRoot: string;
  private readonly toolRunnerMockMode: boolean;

  /** Improvements from the last Gatekeeper run – fed back to Guide. */
  private previousImprovements: string[] = [];

  constructor(config: OrchestratorConfig) {
    this.llm = config.llm;
    this.memory = new MemoryManager(config.memoryDir);
    this.policy = config.permissionPolicy ?? createDefaultPolicy(config.workspaceRoot);
    this.learner = new Learner(this.llm);
    this.workspaceRoot = config.workspaceRoot;
    this.toolRunnerMockMode = config.toolRunnerMockMode ?? true;
  }

  async initialize(): Promise<void> {
    await this.memory.initialize();
  }

  getMemory(): MemoryManager {
    return this.memory;
  }

  async run(request: string): Promise<RunArtifact> {
    const runId = uuidv4();
    const startedAt = new Date().toISOString();

    const context: PipelineContext = {
      runId,
      request,
      previousImprovements: this.previousImprovements,
    };

    logger.info({ runId, request: request.slice(0, 100) }, "Pipeline started");

    try {
      // 1. Observer
      logger.info({ runId }, "Running Observer");
      const observer = new Observer(this.llm);
      const observerOut = await observer.run(request, context);
      ObserverOutputSchema.parse(observerOut);
      context.observer = observerOut;

      // 2. PatternObserver
      logger.info({ runId }, "Running PatternObserver");
      const patternObserver = new PatternObserver(this.llm);
      const patternOut = await patternObserver.run(request, context);
      PatternObserverOutputSchema.parse(patternOut);
      context.patternObserver = patternOut;

      // 3. CruxFinder
      logger.info({ runId }, "Running CruxFinder");
      const cruxFinder = new CruxFinder(this.llm);
      const cruxOut = await cruxFinder.run(request, context);
      CruxFinderOutputSchema.parse(cruxOut);
      context.cruxFinder = cruxOut;

      // 4. Retriever
      logger.info({ runId }, "Running Retriever");
      const retriever = new Retriever(this.llm, this.memory);
      const retrieverOut = await retriever.run(request, context);
      RetrieverOutputSchema.parse(retrieverOut);
      context.retriever = retrieverOut;

      // 5. Guide (receives retrieved lessons + previous improvements)
      logger.info({ runId }, "Running Guide");
      const guide = new Guide(this.llm);
      const guideOut = await guide.run(request, context);
      GuideOutputSchema.parse(guideOut);
      context.guide = guideOut;

      // 6. Planner
      logger.info({ runId }, "Running Planner");
      const planner = new Planner(this.llm);
      const plannerOut = await planner.run(request, context);
      PlannerOutputSchema.parse(plannerOut);
      context.planner = plannerOut;

      // 7. SafetyGuard
      logger.info({ runId }, "Running SafetyGuard");
      const safetyGuard = new SafetyGuard(this.llm, this.policy);
      const safetyOut = await safetyGuard.run(request, context);
      SafetyGuardOutputSchema.parse(safetyOut);
      context.safetyGuard = safetyOut;

      // 8. Implementor
      logger.info({ runId }, "Running Implementor");
      const implementor = new Implementor(this.llm, this.policy);
      const implOut = await implementor.run(request, context);
      ImplementorOutputSchema.parse(implOut);
      context.implementor = implOut;

      // 9. ToolRunner
      logger.info({ runId }, "Running ToolRunner");
      const toolRunner = new ToolRunner({
        mockMode: this.toolRunnerMockMode,
        workspaceRoot: this.workspaceRoot,
      });
      const toolRunnerOut = await toolRunner.run(request, context);
      ToolRunnerOutputSchema.parse(toolRunnerOut);
      context.toolRunner = toolRunnerOut;

      // 10. Gatekeeper
      logger.info({ runId }, "Running Gatekeeper");
      const gatekeeper = new Gatekeeper(this.llm, this.memory);
      const gatekeeperOut = await gatekeeper.run(request, context);
      GatekeeperOutputSchema.parse(gatekeeperOut);
      context.gatekeeper = gatekeeperOut;

      // 11. Learner
      logger.info({ runId }, "Running Learner");
      const learnerOut = await this.learner.run(request, context);
      LearnerOutputSchema.parse(learnerOut);
      context.learner = learnerOut;

      // ── Feedback Loops ──────────────────────────────────────────

      // Gatekeeper → Learner: approve / reject candidate lessons
      // (already handled inside Gatekeeper.run via memory)

      // Gatekeeper → Implementor: promote permission level
      if (gatekeeperOut.decision.promote && gatekeeperOut.decision.newLevel !== undefined) {
        this.learner.setLevel(gatekeeperOut.decision.newLevel);
        logger.info({ runId, newLevel: gatekeeperOut.decision.newLevel }, "Learner promoted");
      }

      // Gatekeeper → Guide: store improvements for next run
      if (gatekeeperOut.improvements.length > 0) {
        this.previousImprovements = gatekeeperOut.improvements;
        logger.info(
          { runId, improvementCount: gatekeeperOut.improvements.length },
          "Stored improvements for next Guide run",
        );
      }

      // ── Build Artifact ──────────────────────────────────────────

      const artifact: RunArtifact = {
        runId,
        request,
        startedAt,
        completedAt: new Date().toISOString(),
        observer: observerOut,
        patternObserver: patternOut,
        cruxFinder: cruxOut,
        retriever: retrieverOut,
        guide: guideOut,
        planner: plannerOut,
        safetyGuard: safetyOut,
        implementor: implOut,
        toolRunner: toolRunnerOut,
        gatekeeper: gatekeeperOut,
        learner: learnerOut,
        success: true,
      };

      // Validate the entire artifact
      RunArtifactSchema.parse(artifact);

      // Store artifact
      const artifactPath = await this.memory.saveRunArtifact(artifact);
      logger.info({ runId, artifactPath }, "Run artifact saved");

      // Store portfolio entry
      await this.memory.savePortfolioEntry({
        runId,
        request,
        completedAt: artifact.completedAt,
        scorecard: gatekeeperOut.scorecard,
        totalScore: gatekeeperOut.totalScore,
        artifactPath,
      });

      logger.info({ runId, totalScore: gatekeeperOut.totalScore }, "Pipeline completed");
      return artifact;
    } catch (error) {
      const errorMessage =
        error instanceof ZodError
          ? `Schema validation failed: ${error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`
          : error instanceof Error
            ? error.message
            : "Unknown error";

      logger.error({ runId, error: errorMessage }, "Pipeline failed");
      throw new Error(`Pipeline run ${runId} failed: ${errorMessage}`);
    }
  }
}

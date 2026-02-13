import "dotenv/config";
import * as path from "node:path";
import { Orchestrator } from "../core/pipeline/orchestrator.js";
import { createLLMProvider } from "../providers/index.js";

const MEMORY_DIR = path.resolve(process.cwd(), "memory");
const WORKSPACE_ROOT = process.cwd();

async function main(): Promise<void> {
  const request = process.argv.slice(2).join(" ");

  if (!request) {
    console.error("Usage: pnpm run cli -- \"your request here\"");
    process.exit(1);
  }

  const llm = createLLMProvider();

  console.log("═══════════════════════════════════════════════════════");
  console.log("  AgencyCore Pipeline");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Provider: ${llm.name}`);
  console.log(`  Request: ${request}`);
  console.log("───────────────────────────────────────────────────────\n");

  const orchestrator = new Orchestrator({
    llm,
    memoryDir: MEMORY_DIR,
    workspaceRoot: WORKSPACE_ROOT,
  });

  await orchestrator.initialize();

  try {
    const artifact = await orchestrator.run(request);

    console.log("\n✅ Pipeline completed successfully!\n");
    console.log(`  Run ID:      ${artifact.runId}`);
    console.log(`  Total Score: ${artifact.gatekeeper.totalScore}/25`);
    console.log(`  Promoted:    ${artifact.gatekeeper.decision.promote}`);
    console.log(`  Lessons:     ${artifact.gatekeeper.approvedLessons.length} approved, ${artifact.gatekeeper.rejectedLessons.length} rejected`);

    console.log("\n── Scorecard ──────────────────────────────────────");
    const sc = artifact.gatekeeper.scorecard;
    console.log(`  Correctness:  ${sc.correctness}/5`);
    console.log(`  Verification: ${sc.verification}/5`);
    console.log(`  Safety:       ${sc.safety}/5`);
    console.log(`  Clarity:      ${sc.clarity}/5`);
    console.log(`  Autonomy:     ${sc.autonomy}/5`);

    console.log("\n── Agent Outputs ──────────────────────────────────");
    console.log(`  Observer:        ${artifact.observer.summary.slice(0, 80)}...`);
    console.log(`  PatternObserver: ${artifact.patternObserver.patterns.length} patterns found`);
    console.log(`  CruxFinder:      ${artifact.cruxFinder.subProblems.length} sub-problems`);
    console.log(`  Retriever:       ${artifact.retriever.lessons.length} lessons, ${artifact.retriever.playbooks.length} playbooks, ${artifact.retriever.examples.length} examples`);
    console.log(`  Guide:           ${artifact.guide.plan.length} steps, complexity: ${artifact.guide.estimatedComplexity}, ${artifact.guide.bestPractices.length} best practices`);
    console.log(`  Planner:         ${artifact.planner.tasks.length} tasks`);
    console.log(`  SafetyGuard:     safe=${artifact.safetyGuard.safe}, ${artifact.safetyGuard.risks.length} risks, ${artifact.safetyGuard.blockedActions.length} blocked`);
    console.log(`  Implementor:     ${artifact.implementor.actions.length} actions, ${artifact.implementor.blocked.length} blocked`);
    console.log(`  ToolRunner:      ${artifact.toolRunner.executedCommands.length} executed, ${artifact.toolRunner.skippedCommands.length} skipped`);
    console.log(`  Gatekeeper:      ${artifact.gatekeeper.feedback}`);
    console.log(`  Learner:         ${artifact.learner.candidateLessons.length} candidate lessons`);

    console.log("\n── Full Artifact ──────────────────────────────────");
    console.log(JSON.stringify(artifact, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`\n❌ Pipeline failed: ${message}`);
    process.exit(1);
  }
}

main();

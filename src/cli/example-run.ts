import * as path from "node:path";
import { Orchestrator } from "../core/pipeline/orchestrator.js";
import { MockLLM } from "../providers/mock-llm.js";

const MEMORY_DIR = path.resolve(process.cwd(), "memory");
const WORKSPACE_ROOT = process.cwd();

async function exampleRun(): Promise<void> {
  console.log("🔄 Running example pipeline...\n");

  const orchestrator = new Orchestrator({
    llm: new MockLLM(),
    memoryDir: MEMORY_DIR,
    workspaceRoot: WORKSPACE_ROOT,
  });

  await orchestrator.initialize();

  const request = "Create a hello world TypeScript function and a unit test";
  console.log(`Request: "${request}"\n`);

  const artifact = await orchestrator.run(request);

  console.log("✅ Pipeline complete!");
  console.log(`   Run ID:      ${artifact.runId}`);
  console.log(`   Score:        ${artifact.gatekeeper.totalScore}/25`);
  console.log(`   Promoted:     ${artifact.gatekeeper.decision.promote}`);
  console.log(`   Safe:         ${artifact.safetyGuard.safe}`);
  console.log(`   Tasks:        ${artifact.planner.tasks.length} planned`);
  console.log(`   Files:        ${artifact.implementor.filesCreated.length} created`);
  console.log(`   Commands:     ${artifact.toolRunner.executedCommands.length} executed, ${artifact.toolRunner.skippedCommands.length} skipped`);
  console.log(`   Lessons:      ${artifact.gatekeeper.approvedLessons.length} approved`);
  console.log(`   Improvements: ${artifact.gatekeeper.improvements.length}`);
  console.log(`   Stored at:    memory/logs/${artifact.runId}.json`);
  console.log("\nDone.");
}

exampleRun();

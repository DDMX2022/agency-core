import type { LLMProvider } from "../../providers/llm-provider.js";
import type { SafetyGuardOutput, PipelineContext } from "../schemas/index.js";
import type { PermissionPolicy } from "../permissions/index.js";

/**
 * Dangerous patterns that are always blocked, regardless of permission level.
 */
const DANGEROUS_PATTERNS = [
  "rm -rf",
  "rm -r /",
  "mkfs",
  "dd if=",
  "chmod -R 777",
  "sudo",
  "> /dev/sda",
  "format c:",
  "del /f /s",
  "shutdown",
  "reboot",
  "drop database",
  "drop table",
  "truncate table",
  "delete from",
  "process.env",
  "api_key",
  "api_secret",
  "password",
  "secret_key",
  "private_key",
];

/**
 * SafetyGuard Agent
 * Validates the full plan BEFORE execution.
 * Blocks destructive commands, out-of-workspace paths, and secret exposure.
 */
export class SafetyGuard {
  constructor(
    private readonly llm: LLMProvider,
    private readonly policy: PermissionPolicy,
  ) {}

  async run(_input: string, context: PipelineContext): Promise<SafetyGuardOutput> {
    const planner = context.planner;
    const guide = context.guide;
    if (!planner || !guide) {
      throw new Error("SafetyGuard requires Planner and Guide output in context");
    }

    await this.llm.generate(
      "SafetyGuard: Validate plan safety before execution.",
      JSON.stringify({ taskCount: planner.tasks.length, complexity: guide.estimatedComplexity }),
    );

    const risks: string[] = [];
    const blockedActions: string[] = [];
    let requiresApproval = false;

    // Check each task for dangerous patterns
    for (const task of planner.tasks) {
      for (const step of task.steps) {
        const lowerStep = step.toLowerCase();

        // Check dangerous command patterns
        for (const pattern of DANGEROUS_PATTERNS) {
          if (lowerStep.includes(pattern.toLowerCase())) {
            blockedActions.push(`Task ${task.id}: Step "${step}" contains dangerous pattern "${pattern}"`);
            risks.push(`Dangerous pattern "${pattern}" detected in task "${task.title}"`);
          }
        }

        // Check for secret exposure
        if (lowerStep.includes("console.log") && (lowerStep.includes("key") || lowerStep.includes("secret") || lowerStep.includes("password"))) {
          risks.push(`Potential secret exposure in task "${task.title}": ${step}`);
          requiresApproval = true;
        }
      }

      // Check for out-of-workspace paths in task descriptions
      if (task.description.includes("/etc/") ||
          task.description.includes("/usr/") ||
          task.description.includes("/root/") ||
          task.description.includes("C:\\Windows")) {
        blockedActions.push(`Task ${task.id}: References system path outside workspace`);
        risks.push(`Out-of-workspace path in task "${task.title}"`);
      }
    }

    // Check permission level vs task requirements
    if (this.policy.currentLevel === 0) {
      const writeTasks = planner.tasks.filter((t) => t.owner === "implementor");
      if (writeTasks.length > 0) {
        risks.push(`${writeTasks.length} implementor tasks require L1+ permissions (current: L0)`);
        requiresApproval = true;
      }
    }

    // High complexity = elevated risk
    if (guide.estimatedComplexity === "high") {
      risks.push("High complexity plan – recommend additional review");
    }

    const safe = blockedActions.length === 0 && !requiresApproval;

    return {
      agent: "SafetyGuard",
      safe,
      risks,
      blockedActions,
      requiresApproval,
      timestamp: new Date().toISOString(),
    };
  }
}

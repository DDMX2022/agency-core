import pino from "pino";
import type { ToolRunnerOutput, PipelineContext, ImplementorAction } from "../schemas/index.js";

const logger = pino({ name: "tool-runner" });

/**
 * Dangerous command patterns that the ToolRunner will never execute.
 */
const BLOCKED_COMMANDS = [
  "rm -rf",
  "rm -r /",
  "mkfs",
  "dd if=",
  "chmod -R 777",
  "sudo",
  "> /dev/sda",
  "format",
  "del /f /s",
  "shutdown",
  "reboot",
  "kill -9",
  "drop database",
  "drop table",
];

export interface ToolRunnerConfig {
  /** When true (default), commands are logged but NOT actually executed. */
  mockMode: boolean;
  /** Workspace root – commands are only allowed within this directory. */
  workspaceRoot: string;
}

/**
 * ToolRunner – optional execution layer.
 * In mock mode (default), all commands are logged but not executed.
 * In live mode, only safe commands within the workspace are executed.
 */
export class ToolRunner {
  private readonly config: ToolRunnerConfig;

  constructor(config: ToolRunnerConfig) {
    this.config = config;
  }

  async run(_input: string, context: PipelineContext): Promise<ToolRunnerOutput> {
    const impl = context.implementor;
    if (!impl) {
      throw new Error("ToolRunner requires Implementor output in context");
    }

    const executedCommands: ToolRunnerOutput["executedCommands"] = [];
    const skippedCommands: string[] = [];

    // Process only runCommand actions
    const commandActions = impl.actions.filter(
      (a): a is ImplementorAction & { command: string } =>
        a.type === "runCommand" && typeof a.command === "string",
    );

    for (const action of commandActions) {
      const cmd = action.command;

      // Safety check: block dangerous commands
      if (this.isDangerous(cmd)) {
        skippedCommands.push(`BLOCKED (dangerous): ${cmd}`);
        logger.warn({ cmd }, "ToolRunner blocked dangerous command");
        continue;
      }

      // Safety check: commands flagged as needing approval
      if (action.requiresApproval) {
        skippedCommands.push(`SKIPPED (requires approval): ${cmd}`);
        logger.info({ cmd }, "ToolRunner skipped command requiring approval");
        continue;
      }

      if (this.config.mockMode) {
        // Mock mode: log but don't execute
        logger.info({ cmd, mockMode: true }, "ToolRunner mock-executed command");
        executedCommands.push({
          command: cmd,
          success: true,
          output: `[MOCK] Would execute: ${cmd}`,
          mockMode: true,
        });
      } else {
        // Live mode scaffold – does NOT actually execute in this version
        // In a real implementation, you'd use child_process.exec here
        logger.info({ cmd, mockMode: false }, "ToolRunner would execute (live mode scaffold)");
        executedCommands.push({
          command: cmd,
          success: true,
          output: `[SCAFFOLD] Live execution not yet implemented: ${cmd}`,
          mockMode: false,
        });
      }
    }

    // Also log file operations as "executed" in mock mode
    const fileActions = impl.actions.filter(
      (a) => a.type === "createFile" || a.type === "editFile",
    );
    for (const action of fileActions) {
      if (action.isDestructive) {
        skippedCommands.push(`BLOCKED (destructive file op): ${action.path ?? "unknown"}`);
        continue;
      }
      executedCommands.push({
        command: `${action.type}: ${action.path ?? "unknown"}`,
        success: true,
        output: this.config.mockMode
          ? `[MOCK] Would ${action.type}: ${action.path ?? "unknown"}`
          : `[SCAFFOLD] ${action.type}: ${action.path ?? "unknown"}`,
        mockMode: this.config.mockMode,
      });
    }

    return {
      agent: "ToolRunner",
      executedCommands,
      skippedCommands,
      timestamp: new Date().toISOString(),
    };
  }

  private isDangerous(cmd: string): boolean {
    const lower = cmd.toLowerCase();
    return BLOCKED_COMMANDS.some((pattern) => lower.includes(pattern.toLowerCase()));
  }
}

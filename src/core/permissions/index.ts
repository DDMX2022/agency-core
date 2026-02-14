import type { ImplementorAction } from "../schemas/index.js";

/**
 * Permission levels:
 *   L0 – read-only planning
 *   L1 – safe file edits in sandbox
 *   L2 – git branch + commit
 *   L3 – review + mentor
 */
export type PermissionLevel = 0 | 1 | 2 | 3;

export interface PermissionPolicy {
  currentLevel: PermissionLevel;
  allowedWorkspacePaths: string[];
  blockedCommands: string[];
}

const DEFAULT_BLOCKED_COMMANDS = [
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
];

export function createDefaultPolicy(workspaceRoot: string): PermissionPolicy {
  return {
    currentLevel: 1,
    allowedWorkspacePaths: [workspaceRoot],
    blockedCommands: [...DEFAULT_BLOCKED_COMMANDS],
  };
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason: string;
  requiresApproval: boolean;
}

/**
 * Check whether an Implementor action is allowed under the current policy.
 */
export function checkPermission(
  action: ImplementorAction,
  policy: PermissionPolicy,
): PermissionCheckResult {
  // L0: read-only – only readFile allowed
  if (policy.currentLevel === 0) {
    if (action.type === "readFile") {
      return { allowed: true, reason: "Read-only action allowed at L0", requiresApproval: false };
    }
    return {
      allowed: false,
      reason: `Action "${action.type}" blocked: current level is L0 (read-only planning)`,
      requiresApproval: false,
    };
  }

  // Destructive check (applies to all levels)
  if (action.isDestructive) {
    return {
      allowed: false,
      reason: "Destructive action blocked by default – requires explicit approval",
      requiresApproval: true,
    };
  }

  // Command check
  if (action.type === "runCommand" && action.command) {
    const lowerCmd = action.command.toLowerCase();
    for (const blocked of policy.blockedCommands) {
      if (lowerCmd.includes(blocked.toLowerCase())) {
        return {
          allowed: false,
          reason: `Command blocked: contains "${blocked}"`,
          requiresApproval: true,
        };
      }
    }

    // L1 can only run safe commands (no git)
    if (policy.currentLevel === 1 && (lowerCmd.startsWith("git ") || lowerCmd.includes("git "))) {
      return {
        allowed: false,
        reason: "Git commands require L2 or higher",
        requiresApproval: false,
      };
    }
  }

  // Path check for file operations
  if ((action.type === "createFile" || action.type === "editFile") && action.path) {
    const isInsideWorkspace = policy.allowedWorkspacePaths.some((ws) =>
      action.path!.startsWith(ws),
    );
    if (!isInsideWorkspace) {
      return {
        allowed: false,
        reason: `Path "${action.path}" is outside the allowed workspace`,
        requiresApproval: false,
      };
    }
  }

  // L1: safe file edits only
  if (policy.currentLevel === 1) {
    if (action.type === "createFile" || action.type === "editFile" || action.type === "readFile") {
      return { allowed: true, reason: "File operation allowed at L1", requiresApproval: false };
    }
    if (action.type === "runCommand") {
      return {
        allowed: true,
        reason: "Non-destructive command allowed at L1",
        requiresApproval: false,
      };
    }
  }

  // L2: git + file operations
  if (policy.currentLevel >= 2) {
    return { allowed: true, reason: `Action allowed at L${policy.currentLevel}`, requiresApproval: false };
  }

  return { allowed: false, reason: "Unknown action or insufficient permissions", requiresApproval: false };
}

/**
 * Evaluate all actions from the Implementor and return filtered results.
 */
export function evaluateActions(
  actions: ImplementorAction[],
  policy: PermissionPolicy,
): { allowed: ImplementorAction[]; blocked: { action: ImplementorAction; result: PermissionCheckResult }[] } {
  const allowed: ImplementorAction[] = [];
  const blocked: { action: ImplementorAction; result: PermissionCheckResult }[] = [];

  for (const action of actions) {
    const result = checkPermission(action, policy);
    if (result.allowed) {
      allowed.push(action);
    } else {
      blocked.push({ action, result });
    }
  }

  return { allowed, blocked };
}

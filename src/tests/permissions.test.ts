import { describe, it, expect } from "vitest";
import {
  checkPermission,
  evaluateActions,
  createDefaultPolicy,
  type PermissionPolicy,
} from "../core/permissions/index.js";
import type { ImplementorAction } from "../core/schemas/index.js";

describe("Permissions", () => {
  const workspaceRoot = "/home/user/project";

  it("should block all non-read actions at L0", () => {
    const policy: PermissionPolicy = {
      currentLevel: 0,
      allowedWorkspacePaths: [workspaceRoot],
      blockedCommands: [],
    };

    const readAction: ImplementorAction = {
      type: "readFile",
      path: `${workspaceRoot}/file.ts`,
      requiresApproval: false,
      isDestructive: false,
    };
    expect(checkPermission(readAction, policy).allowed).toBe(true);

    const createAction: ImplementorAction = {
      type: "createFile",
      path: `${workspaceRoot}/file.ts`,
      content: "hello",
      requiresApproval: false,
      isDestructive: false,
    };
    expect(checkPermission(createAction, policy).allowed).toBe(false);

    const cmdAction: ImplementorAction = {
      type: "runCommand",
      command: "echo hello",
      requiresApproval: false,
      isDestructive: false,
    };
    expect(checkPermission(cmdAction, policy).allowed).toBe(false);
  });

  it("should block destructive actions at any level", () => {
    const policy: PermissionPolicy = {
      currentLevel: 2,
      allowedWorkspacePaths: [workspaceRoot],
      blockedCommands: [],
    };

    const destructive: ImplementorAction = {
      type: "runCommand",
      command: "echo test",
      requiresApproval: false,
      isDestructive: true,
    };

    const result = checkPermission(destructive, policy);
    expect(result.allowed).toBe(false);
    expect(result.requiresApproval).toBe(true);
    expect(result.reason).toContain("Destructive");
  });

  it("should block rm -rf commands", () => {
    const policy = createDefaultPolicy(workspaceRoot);
    policy.currentLevel = 2;

    const dangerous: ImplementorAction = {
      type: "runCommand",
      command: "rm -rf /",
      requiresApproval: false,
      isDestructive: false,
    };

    const result = checkPermission(dangerous, policy);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("blocked");
  });

  it("should block paths outside workspace", () => {
    const policy: PermissionPolicy = {
      currentLevel: 1,
      allowedWorkspacePaths: [workspaceRoot],
      blockedCommands: [],
    };

    const outsidePath: ImplementorAction = {
      type: "createFile",
      path: "/etc/passwd",
      content: "hacked",
      requiresApproval: false,
      isDestructive: false,
    };

    const result = checkPermission(outsidePath, policy);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("outside");
  });

  it("should block git commands at L1", () => {
    const policy: PermissionPolicy = {
      currentLevel: 1,
      allowedWorkspacePaths: [workspaceRoot],
      blockedCommands: [],
    };

    const gitCmd: ImplementorAction = {
      type: "runCommand",
      command: "git push origin main",
      requiresApproval: false,
      isDestructive: false,
    };

    const result = checkPermission(gitCmd, policy);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Git");
  });

  it("should allow file operations at L1 within workspace", () => {
    const policy: PermissionPolicy = {
      currentLevel: 1,
      allowedWorkspacePaths: [workspaceRoot],
      blockedCommands: [],
    };

    const create: ImplementorAction = {
      type: "createFile",
      path: `${workspaceRoot}/new-file.ts`,
      content: "export const x = 1;",
      requiresApproval: false,
      isDestructive: false,
    };

    expect(checkPermission(create, policy).allowed).toBe(true);
  });

  it("should evaluate multiple actions and separate allowed/blocked", () => {
    const policy: PermissionPolicy = {
      currentLevel: 1,
      allowedWorkspacePaths: [workspaceRoot],
      blockedCommands: [],
    };

    const actions: ImplementorAction[] = [
      { type: "createFile", path: `${workspaceRoot}/ok.ts`, content: "ok", requiresApproval: false, isDestructive: false },
      { type: "createFile", path: "/etc/bad.ts", content: "bad", requiresApproval: false, isDestructive: false },
      { type: "runCommand", command: "echo hi", requiresApproval: false, isDestructive: true },
    ];

    const result = evaluateActions(actions, policy);
    expect(result.allowed.length).toBe(1);
    expect(result.blocked.length).toBe(2);
  });
});

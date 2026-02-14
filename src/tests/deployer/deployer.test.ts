import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ProjectDeployer } from "../../core/deployer/index.js";
import type { DeployResult } from "../../core/deployer/index.js";

describe("ProjectDeployer", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "deployer-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should be constructable", () => {
    const deployer = new ProjectDeployer("testowner");
    expect(deployer).toBeDefined();
  });

  it("should fail for empty source dir", async () => {
    const deployer = new ProjectDeployer("testowner");
    const result = await deployer.deploy({
      sourceDir: path.join(tmpDir, "nonexistent"),
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("should fail for empty directory", async () => {
    const emptyDir = path.join(tmpDir, "empty");
    fs.mkdirSync(emptyDir, { recursive: true });

    const deployer = new ProjectDeployer("testowner");
    const result = await deployer.deploy({
      sourceDir: emptyDir,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("No files");
  });

  it("should fail without owner", async () => {
    const projDir = path.join(tmpDir, "proj");
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, "index.ts"), "export {};");

    // No owner set, env GITHUB_OWNER not set for this instance
    const deployer = new ProjectDeployer("");
    const result = await deployer.deploy({
      sourceDir: projDir,
      owner: "", // explicitly empty
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("GitHub owner");
  });

  it("should fail deployFromWorkspace when no sandbox exists", async () => {
    const workspace = path.join(tmpDir, "ws");
    fs.mkdirSync(workspace, { recursive: true });
    // Add dirs that should be excluded
    fs.mkdirSync(path.join(workspace, "node_modules"), { recursive: true });
    fs.mkdirSync(path.join(workspace, ".git"), { recursive: true });

    const deployer = new ProjectDeployer("testowner");
    const result = await deployer.deployFromWorkspace(workspace);
    expect(result.success).toBe(false);
    expect(result.error).toContain("No project files");
  });

  it("should report files count when gh is missing", async () => {
    const projDir = path.join(tmpDir, "proj");
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, "index.ts"), 'console.log("hello");');
    fs.writeFileSync(path.join(projDir, "package.json"), '{}');

    const deployer = new ProjectDeployer("testowner");
    // Will fail because gh CLI isn't available in test env (or repo creation fails)
    // but we verify the structure is correct
    const result: DeployResult = await deployer.deploy({
      sourceDir: projDir,
      repoName: "test-repo",
    });
    expect(result.filesCount).toBe(2);
    // It either fails with gh not found or some other git error
    expect(result.success).toBe(false);
  });
});

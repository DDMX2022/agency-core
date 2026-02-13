import { execSync } from "node:child_process";
import pino from "pino";

const logger = pino({ name: "self-improve-autogit" });

export interface GitResult {
  success: boolean;
  branch: string;
  commitHash?: string;
  pushUrl?: string;
  error?: string;
}

/**
 * AutoGit
 * Handles the git workflow for self-improvements:
 *   1. Create a feature branch
 *   2. Stage & commit changes
 *   3. Push to remote
 *   4. Optionally switch back to main
 *
 * Safety: all operations are on a branch (never force-pushes to main).
 */
export class AutoGit {
  constructor(private readonly workspaceRoot: string) {}

  /** Get the current branch name. */
  currentBranch(): string {
    return this.git("rev-parse --abbrev-ref HEAD").trim();
  }

  /** Check if the working tree is clean (no uncommitted changes). */
  isClean(): boolean {
    const status = this.git("status --porcelain");
    return status.trim().length === 0;
  }

  /** Create and checkout a new branch. */
  createBranch(name: string): void {
    this.git(`checkout -b ${name}`);
    logger.info({ branch: name }, "Created branch");
  }

  /** Stage all changes. */
  stageAll(): void {
    this.git("add -A");
  }

  /** Commit with a message. */
  commit(message: string): string {
    this.git(`commit -m "${message.replace(/"/g, '\\"')}"`);
    const hash = this.git("rev-parse --short HEAD").trim();
    logger.info({ hash, message: message.slice(0, 80) }, "Committed");
    return hash;
  }

  /** Push the current branch to origin. */
  push(): void {
    const branch = this.currentBranch();
    this.git(`push origin ${branch}`);
    logger.info({ branch }, "Pushed to remote");
  }

  /** Switch to a branch (without creating it). */
  checkout(branch: string): void {
    this.git(`checkout ${branch}`);
  }

  /** Merge a branch into the current branch. */
  merge(branch: string): void {
    this.git(`merge ${branch} --no-edit`);
    logger.info({ branch }, "Merged");
  }

  /** Delete a local branch. */
  deleteBranch(name: string): void {
    try {
      this.git(`branch -d ${name}`);
    } catch {
      // Ignore if already deleted
    }
  }

  /** Get the remote URL. */
  getRemoteUrl(): string {
    try {
      return this.git("remote get-url origin").trim();
    } catch {
      return "unknown";
    }
  }

  /**
   * Full self-improvement git workflow:
   *   1. Create branch `self-improve/{dimension}-{timestamp}`
   *   2. Stage & commit
   *   3. Push to origin
   *   4. Merge into main
   *   5. Push main
   *   6. Clean up branch
   */
  fullWorkflow(
    dimensions: string[],
    commitMessage: string,
  ): GitResult {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const dimSlug = dimensions.slice(0, 2).join("-");
    const branchName = `self-improve/${dimSlug}-${timestamp}`;
    const startBranch = this.currentBranch();

    try {
      // 1. Create feature branch
      this.createBranch(branchName);

      // 2. Stage & commit
      this.stageAll();
      const hash = this.commit(commitMessage);

      // 3. Push feature branch
      this.push();

      // 4. Switch to main and merge
      this.checkout(startBranch);
      this.merge(branchName);

      // 5. Push main
      this.git(`push origin ${startBranch}`);

      // 6. Clean up feature branch
      this.deleteBranch(branchName);

      const remoteUrl = this.getRemoteUrl();

      logger.info(
        { branch: branchName, hash, remote: remoteUrl },
        "Self-improvement pushed successfully",
      );

      return {
        success: true,
        branch: branchName,
        commitHash: hash,
        pushUrl: remoteUrl,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ branch: branchName, error: msg }, "Git workflow failed");

      // Try to get back to the original branch
      try {
        this.checkout(startBranch);
      } catch {
        // Best effort
      }

      return {
        success: false,
        branch: branchName,
        error: msg,
      };
    }
  }

  private git(command: string): string {
    return execSync(`git ${command}`, {
      cwd: this.workspaceRoot,
      encoding: "utf-8",
      timeout: 30_000,
    });
  }
}

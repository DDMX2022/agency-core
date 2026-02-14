import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pino from "pino";

const logger = pino({ name: "project-deployer" });

export interface DeployResult {
  success: boolean;
  repoUrl?: string;
  commitHash?: string;
  filesCount: number;
  error?: string;
}

export interface DeployOptions {
  /** The directory containing files to deploy (e.g. the sandbox output). */
  sourceDir: string;
  /** GitHub owner (username or org). Falls back to env GITHUB_OWNER. */
  owner?: string;
  /** Repo name to create/push to. Auto-generated from project name if omitted. */
  repoName?: string;
  /** Commit message. */
  commitMessage?: string;
  /** If true, creates a private repo. Default false. */
  isPrivate?: boolean;
}

/**
 * ProjectDeployer
 *
 * Takes a directory of generated project files and deploys them to a
 * fresh GitHub repository.
 *
 * Flow:
 *   1. Ensure `gh` CLI is available (GitHub CLI)
 *   2. Create a new GitHub repo via `gh repo create`
 *   3. Init git in the source dir, commit all files
 *   4. Push to the new remote
 *   5. Return the repo URL
 */
export class ProjectDeployer {
  private readonly owner: string;

  constructor(owner?: string) {
    this.owner = owner ?? process.env["GITHUB_OWNER"] ?? "";
  }

  /**
   * Deploy the project directory to GitHub.
   */
  async deploy(opts: DeployOptions): Promise<DeployResult> {
    const {
      sourceDir,
      repoName = this.generateRepoName(),
      commitMessage = "🚀 Initial deployment by AgencyCore",
      isPrivate = false,
    } = opts;

    // Validate source directory
    if (!fs.existsSync(sourceDir)) {
      return { success: false, filesCount: 0, error: `Source directory not found: ${sourceDir}` };
    }

    const files = this.listFiles(sourceDir);
    if (files.length === 0) {
      return { success: false, filesCount: 0, error: "No files to deploy" };
    }

    const owner = opts.owner ?? this.owner;
    if (!owner) {
      return { success: false, filesCount: files.length, error: "No GitHub owner configured. Set GITHUB_OWNER env or pass owner option." };
    }

    const fullName = `${owner}/${repoName}`;

    try {
      // 1. Check gh CLI available
      this.ensureGhCli();

      // 2. Create GitHub repo
      const visibility = isPrivate ? "--private" : "--public";
      this.sh(`gh repo create ${fullName} ${visibility} --confirm`, sourceDir);
      logger.info({ repo: fullName }, "Created GitHub repository");

      // 3. Init git, set remote, commit
      if (!fs.existsSync(path.join(sourceDir, ".git"))) {
        this.sh("git init", sourceDir);
      }
      this.sh("git add -A", sourceDir);
      this.sh(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, sourceDir);

      // 4. Set remote and push
      try {
        this.sh(`git remote add origin https://github.com/${fullName}.git`, sourceDir);
      } catch {
        this.sh(`git remote set-url origin https://github.com/${fullName}.git`, sourceDir);
      }
      this.sh("git branch -M main", sourceDir);
      this.sh("git push -u origin main", sourceDir);

      // 5. Get commit hash
      const hash = this.sh("git rev-parse --short HEAD", sourceDir).trim();
      const repoUrl = `https://github.com/${fullName}`;

      logger.info({ repo: fullName, hash, files: files.length }, "Project deployed successfully");

      return {
        success: true,
        repoUrl,
        commitHash: hash,
        filesCount: files.length,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ repo: fullName, error: msg }, "Deployment failed");
      return {
        success: false,
        filesCount: files.length,
        error: msg,
      };
    }
  }

  /**
   * Deploy files that the Implementor already wrote into the workspace sandbox.
   * Looks for the sandbox directory under the workspace root.
   */
  async deployFromWorkspace(workspaceRoot: string, opts?: Partial<DeployOptions>): Promise<DeployResult> {
    // The Implementor writes files into allowedWorkspacePaths[0] which
    // defaults to workspaceRoot. Projects go into workspaceRoot/sandbox/.
    const sandboxDir = path.join(workspaceRoot, "sandbox");
    if (!fs.existsSync(sandboxDir)) {
      // Fallback: look for any generated project directories
      const candidates = fs.readdirSync(workspaceRoot).filter((entry) => {
        const full = path.join(workspaceRoot, entry);
        return fs.statSync(full).isDirectory() &&
          !entry.startsWith(".") &&
          !["node_modules", "memory", "src", "dist"].includes(entry);
      });

      if (candidates.length === 0) {
        return { success: false, filesCount: 0, error: "No project files found to deploy. Run a pipeline first." };
      }

      // Deploy the most recently modified directory
      candidates.sort((a, b) => {
        const aStat = fs.statSync(path.join(workspaceRoot, a));
        const bStat = fs.statSync(path.join(workspaceRoot, b));
        return bStat.mtimeMs - aStat.mtimeMs;
      });

      const targetDir = path.join(workspaceRoot, candidates[0]!);
      return this.deploy({ sourceDir: targetDir, repoName: candidates[0], ...opts });
    }

    return this.deploy({ sourceDir: sandboxDir, ...opts });
  }

  private generateRepoName(): string {
    const ts = new Date().toISOString().slice(0, 10);
    return `agency-project-${ts}`;
  }

  private listFiles(dir: string): string[] {
    const results: string[] = [];
    const walk = (d: string) => {
      for (const entry of fs.readdirSync(d)) {
        if (entry === ".git" || entry === "node_modules") continue;
        const full = path.join(d, entry);
        if (fs.statSync(full).isDirectory()) {
          walk(full);
        } else {
          results.push(full);
        }
      }
    };
    walk(dir);
    return results;
  }

  private ensureGhCli(): void {
    try {
      this.sh("gh --version", process.cwd());
    } catch {
      throw new Error(
        "GitHub CLI (gh) is not installed. Install with: brew install gh"
      );
    }
  }

  private sh(command: string, cwd: string): string {
    return execSync(command, {
      cwd,
      encoding: "utf-8",
      timeout: 60_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  }
}

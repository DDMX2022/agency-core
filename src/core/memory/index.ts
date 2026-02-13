import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { RunArtifact, CandidateLesson, Scorecard } from "../schemas/index.js";

export interface LessonFile {
  id: string;
  title: string;
  content: string;
  tags: string[];
  source: string;
  approvedAt: string;
  approvedBy: string;
}

export interface PortfolioEntry {
  runId: string;
  request: string;
  completedAt: string;
  scorecard: Scorecard;
  totalScore: number;
  artifactPath: string;
}

/**
 * File-based memory manager.
 * Stores lessons, playbooks, portfolio entries, and run logs on disk.
 */
export class MemoryManager {
  private readonly baseDir: string;
  private readonly lessonsDir: string;
  private readonly playbooksDir: string;
  private readonly portfolioDir: string;
  private readonly logsDir: string;
  private readonly candidatesDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.lessonsDir = path.join(baseDir, "lessons");
    this.playbooksDir = path.join(baseDir, "playbooks");
    this.portfolioDir = path.join(baseDir, "portfolio");
    this.logsDir = path.join(baseDir, "logs");
    this.candidatesDir = path.join(baseDir, "candidates");
  }

  /** Ensure all memory directories exist. */
  async initialize(): Promise<void> {
    await fs.mkdir(this.lessonsDir, { recursive: true });
    await fs.mkdir(this.playbooksDir, { recursive: true });
    await fs.mkdir(this.portfolioDir, { recursive: true });
    await fs.mkdir(this.logsDir, { recursive: true });
    await fs.mkdir(this.candidatesDir, { recursive: true });
  }

  // ── Run Artifacts ─────────────────────────────────────────────────

  /** Store a full pipeline run artifact as JSON. */
  async saveRunArtifact(artifact: RunArtifact): Promise<string> {
    const filename = `${artifact.runId}.json`;
    const filepath = path.join(this.logsDir, filename);
    await fs.writeFile(filepath, JSON.stringify(artifact, null, 2), "utf-8");
    return filepath;
  }

  /** Load a run artifact by ID. */
  async loadRunArtifact(runId: string): Promise<RunArtifact | null> {
    const filepath = path.join(this.logsDir, `${runId}.json`);
    try {
      const data = await fs.readFile(filepath, "utf-8");
      return JSON.parse(data) as RunArtifact;
    } catch {
      return null;
    }
  }

  // ── Candidate Lessons ─────────────────────────────────────────────

  /** Store a candidate lesson (proposed by Learner, awaiting Gatekeeper). */
  async saveCandidateLesson(lesson: CandidateLesson, runId: string): Promise<string> {
    const id = `${runId}-${sanitize(lesson.title)}`;
    const filepath = path.join(this.candidatesDir, `${id}.json`);
    await fs.writeFile(
      filepath,
      JSON.stringify({ ...lesson, id, proposedAt: new Date().toISOString(), runId }, null, 2),
      "utf-8",
    );
    return id;
  }

  /** List all candidate lessons. */
  async listCandidateLessons(): Promise<Array<CandidateLesson & { id: string }>> {
    return this.readJsonDir<CandidateLesson & { id: string }>(this.candidatesDir);
  }

  // ── Approved Lessons ──────────────────────────────────────────────

  /** Move a candidate lesson to approved lessons. */
  async approveLesson(candidateId: string): Promise<string> {
    const candidatePath = path.join(this.candidatesDir, `${candidateId}.json`);
    const data = await fs.readFile(candidatePath, "utf-8");
    const candidate = JSON.parse(data) as CandidateLesson & { id: string };

    const lesson: LessonFile = {
      id: candidate.id,
      title: candidate.title,
      content: candidate.content,
      tags: candidate.tags,
      source: candidate.source,
      approvedAt: new Date().toISOString(),
      approvedBy: "Gatekeeper",
    };

    // Write as markdown with JSON front-matter
    const md = [
      "---",
      JSON.stringify(lesson, null, 2),
      "---",
      "",
      `# ${lesson.title}`,
      "",
      lesson.content,
    ].join("\n");

    const lessonPath = path.join(this.lessonsDir, `${lesson.id}.md`);
    await fs.writeFile(lessonPath, md, "utf-8");

    // Remove candidate
    await fs.unlink(candidatePath);

    return lessonPath;
  }

  /** Reject a candidate lesson (delete it). */
  async rejectLesson(candidateId: string): Promise<void> {
    const candidatePath = path.join(this.candidatesDir, `${candidateId}.json`);
    try {
      await fs.unlink(candidatePath);
    } catch {
      // Already removed – ignore
    }
  }

  /** List all playbook names (markdown files in playbooks dir). */
  async listPlaybooks(): Promise<string[]> {
    const files = await this.listFiles(this.playbooksDir, ".md");
    const playbooks: string[] = [];
    for (const file of files) {
      const content = await fs.readFile(file, "utf-8");
      playbooks.push(content);
    }
    return playbooks;
  }

  /** List all approved lessons. */
  async listLessons(): Promise<LessonFile[]> {
    const files = await this.listFiles(this.lessonsDir, ".md");
    const lessons: LessonFile[] = [];
    for (const file of files) {
      const content = await fs.readFile(file, "utf-8");
      const jsonMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (jsonMatch?.[1]) {
        lessons.push(JSON.parse(jsonMatch[1]) as LessonFile);
      }
    }
    return lessons;
  }

  // ── Portfolio ─────────────────────────────────────────────────────

  /** Store a portfolio entry. */
  async savePortfolioEntry(entry: PortfolioEntry): Promise<string> {
    const filename = `${entry.runId}.json`;
    const filepath = path.join(this.portfolioDir, filename);
    await fs.writeFile(filepath, JSON.stringify(entry, null, 2), "utf-8");
    return filepath;
  }

  /** List all portfolio entries. */
  async listPortfolio(): Promise<PortfolioEntry[]> {
    return this.readJsonDir<PortfolioEntry>(this.portfolioDir);
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private async listFiles(dir: string, ext: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries
        .filter((e) => e.isFile() && e.name.endsWith(ext))
        .map((e) => path.join(dir, e.name));
    } catch {
      return [];
    }
  }

  private async readJsonDir<T>(dir: string): Promise<T[]> {
    const files = await this.listFiles(dir, ".json");
    const results: T[] = [];
    for (const file of files) {
      const data = await fs.readFile(file, "utf-8");
      results.push(JSON.parse(data) as T);
    }
    return results;
  }
}

function sanitize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

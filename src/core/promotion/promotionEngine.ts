import * as fs from "node:fs/promises";
import * as path from "node:path";
import pino from "pino";
import type { PermissionLevel } from "../permissions/index.js";

const logger = pino({ name: "promotion-engine" });

/**
 * Promotion thresholds — what it takes to earn each level.
 *
 *  L0 → L1 (Junior Dev):  5 runs, avg score ≥ 12/25, test pass rate ≥ 80%
 *  L1 → L2 (Mid Dev):    15 runs, avg score ≥ 17/25, ≥ 3 deploys, tests ≥ 90%
 *  L2 → L3 (Senior Dev): 30 runs, avg score ≥ 21/25, ≥ 8 deploys, tests ≥ 95%, ≥ 2 self-improve
 */
export interface LevelThreshold {
  minRuns: number;
  minAvgScore: number;
  minTestPassRate: number;
  minDeploys: number;
  minSelfImproves: number;
}

export const PROMOTION_THRESHOLDS: Record<PermissionLevel, LevelThreshold | null> = {
  0: {
    // To reach L1
    minRuns: 5,
    minAvgScore: 12,
    minTestPassRate: 0.8,
    minDeploys: 0,
    minSelfImproves: 0,
  },
  1: {
    // To reach L2
    minRuns: 15,
    minAvgScore: 17,
    minTestPassRate: 0.9,
    minDeploys: 3,
    minSelfImproves: 0,
  },
  2: {
    // To reach L3
    minRuns: 30,
    minAvgScore: 21,
    minTestPassRate: 0.95,
    minDeploys: 8,
    minSelfImproves: 2,
  },
  3: null, // Max level — no further promotion
};

/** Title for each level. */
export const LEVEL_TITLES: Record<PermissionLevel, string> = {
  0: "Intern (read-only)",
  1: "Junior Developer",
  2: "Mid Developer",
  3: "Senior Developer",
};

/**
 * Persistent tracking of an agent's career stats.
 */
export interface CareerStats {
  currentLevel: PermissionLevel;
  totalRuns: number;
  totalScore: number;
  scores: number[];
  testsPassed: number;
  testsFailed: number;
  deployCount: number;
  selfImproveCount: number;
  promotionHistory: PromotionEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface PromotionEvent {
  fromLevel: PermissionLevel;
  toLevel: PermissionLevel;
  reason: string;
  stats: {
    runs: number;
    avgScore: number;
    testPassRate: number;
    deploys: number;
    selfImproves: number;
  };
  timestamp: string;
}

export interface PromotionCheck {
  eligible: boolean;
  currentLevel: PermissionLevel;
  nextLevel: PermissionLevel | null;
  progress: Record<string, { current: number; required: number; met: boolean }>;
}

/**
 * PromotionEngine
 *
 * Tracks career stats across pipeline runs and automatically determines
 * when the agent has earned a promotion to the next permission level.
 *
 * Stats are persisted to disk so they survive restarts.
 */
export class PromotionEngine {
  private readonly statsPath: string;
  private stats: CareerStats;
  private listeners: Array<(event: PromotionEvent) => void> = [];

  constructor(memoryDir: string, initialLevel: PermissionLevel = 1) {
    this.statsPath = path.join(memoryDir, "career-stats.json");
    this.stats = this.defaultStats(initialLevel);
  }

  /** Load stats from disk. Call once at startup. */
  async initialize(): Promise<void> {
    try {
      const data = await fs.readFile(this.statsPath, "utf-8");
      this.stats = JSON.parse(data) as CareerStats;
      logger.info(
        { level: this.stats.currentLevel, runs: this.stats.totalRuns },
        "Career stats loaded",
      );
    } catch {
      // First run — use defaults
      await this.save();
      logger.info({ level: this.stats.currentLevel }, "Career stats initialized");
    }
  }

  /** Register a listener for promotion events. */
  onPromotion(listener: (event: PromotionEvent) => void): void {
    this.listeners.push(listener);
  }

  /** Get current career stats. */
  getStats(): Readonly<CareerStats> {
    return this.stats;
  }

  /** Get current level. */
  getLevel(): PermissionLevel {
    return this.stats.currentLevel;
  }

  /** Get human-readable title for current level. */
  getTitle(): string {
    return LEVEL_TITLES[this.stats.currentLevel];
  }

  /**
   * Record a completed pipeline run.
   * Returns a PromotionEvent if the agent earned a promotion.
   */
  async recordRun(score: number): Promise<PromotionEvent | null> {
    this.stats.totalRuns++;
    this.stats.totalScore += score;
    this.stats.scores.push(score);
    // Keep only last 100 scores for rolling average
    if (this.stats.scores.length > 100) {
      this.stats.scores = this.stats.scores.slice(-100);
    }
    this.stats.updatedAt = new Date().toISOString();
    await this.save();
    return this.checkAndPromote();
  }

  /** Record test results. */
  async recordTests(passed: number, failed: number): Promise<void> {
    this.stats.testsPassed += passed;
    this.stats.testsFailed += failed;
    this.stats.updatedAt = new Date().toISOString();
    await this.save();
  }

  /** Record a successful deploy. */
  async recordDeploy(): Promise<PromotionEvent | null> {
    this.stats.deployCount++;
    this.stats.updatedAt = new Date().toISOString();
    await this.save();
    return this.checkAndPromote();
  }

  /** Record a successful self-improvement cycle. */
  async recordSelfImprove(): Promise<PromotionEvent | null> {
    this.stats.selfImproveCount++;
    this.stats.updatedAt = new Date().toISOString();
    await this.save();
    return this.checkAndPromote();
  }

  /**
   * Check promotion eligibility without promoting.
   */
  checkPromotion(): PromotionCheck {
    const current = this.stats.currentLevel;
    if (current >= 3) {
      return { eligible: false, currentLevel: current, nextLevel: null, progress: {} };
    }

    const nextLevel = (current + 1) as PermissionLevel;
    const threshold = PROMOTION_THRESHOLDS[current];
    if (!threshold) {
      return { eligible: false, currentLevel: current, nextLevel: null, progress: {} };
    }

    const avgScore = this.stats.totalRuns > 0
      ? this.stats.totalScore / this.stats.totalRuns
      : 0;
    const totalTests = this.stats.testsPassed + this.stats.testsFailed;
    const testPassRate = totalTests > 0
      ? this.stats.testsPassed / totalTests
      : 0;

    const progress: Record<string, { current: number; required: number; met: boolean }> = {
      runs: {
        current: this.stats.totalRuns,
        required: threshold.minRuns,
        met: this.stats.totalRuns >= threshold.minRuns,
      },
      avgScore: {
        current: Math.round(avgScore * 10) / 10,
        required: threshold.minAvgScore,
        met: avgScore >= threshold.minAvgScore,
      },
      testPassRate: {
        current: Math.round(testPassRate * 100),
        required: Math.round(threshold.minTestPassRate * 100),
        met: testPassRate >= threshold.minTestPassRate,
      },
      deploys: {
        current: this.stats.deployCount,
        required: threshold.minDeploys,
        met: this.stats.deployCount >= threshold.minDeploys,
      },
      selfImproves: {
        current: this.stats.selfImproveCount,
        required: threshold.minSelfImproves,
        met: this.stats.selfImproveCount >= threshold.minSelfImproves,
      },
    };

    const eligible = Object.values(progress).every((p) => p.met);

    return { eligible, currentLevel: current, nextLevel, progress };
  }

  /** Check and auto-promote if eligible. */
  private async checkAndPromote(): Promise<PromotionEvent | null> {
    const check = this.checkPromotion();
    if (!check.eligible || check.nextLevel === null) return null;

    const fromLevel = this.stats.currentLevel;
    const toLevel = check.nextLevel;

    const avgScore = this.stats.totalRuns > 0
      ? Math.round((this.stats.totalScore / this.stats.totalRuns) * 10) / 10
      : 0;
    const totalTests = this.stats.testsPassed + this.stats.testsFailed;
    const testPassRate = totalTests > 0 ? this.stats.testsPassed / totalTests : 0;

    const event: PromotionEvent = {
      fromLevel,
      toLevel,
      reason: `Promoted from ${LEVEL_TITLES[fromLevel]} to ${LEVEL_TITLES[toLevel]}`,
      stats: {
        runs: this.stats.totalRuns,
        avgScore,
        testPassRate: Math.round(testPassRate * 100) / 100,
        deploys: this.stats.deployCount,
        selfImproves: this.stats.selfImproveCount,
      },
      timestamp: new Date().toISOString(),
    };

    this.stats.currentLevel = toLevel;
    this.stats.promotionHistory.push(event);
    this.stats.updatedAt = new Date().toISOString();
    await this.save();

    logger.info(
      { from: fromLevel, to: toLevel, title: LEVEL_TITLES[toLevel] },
      "🎉 PROMOTION!",
    );

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        logger.error({ error: err }, "Promotion listener error");
      }
    }

    return event;
  }

  private async save(): Promise<void> {
    const dir = path.dirname(this.statsPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.statsPath, JSON.stringify(this.stats, null, 2), "utf-8");
  }

  private defaultStats(level: PermissionLevel): CareerStats {
    return {
      currentLevel: level,
      totalRuns: 0,
      totalScore: 0,
      scores: [],
      testsPassed: 0,
      testsFailed: 0,
      deployCount: 0,
      selfImproveCount: 0,
      promotionHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  PromotionEngine,
  PROMOTION_THRESHOLDS,
  LEVEL_TITLES,
} from "../../core/promotion/index.js";

describe("PromotionEngine", () => {
  let tmpDir: string;
  let engine: PromotionEngine;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "promo-test-"));
    engine = new PromotionEngine(tmpDir, 0);
    await engine.initialize();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should initialize with default stats", () => {
    const stats = engine.getStats();
    expect(stats.currentLevel).toBe(0);
    expect(stats.totalRuns).toBe(0);
    expect(stats.deployCount).toBe(0);
    expect(stats.promotionHistory).toHaveLength(0);
  });

  it("should record runs and update stats", async () => {
    await engine.recordRun(15);
    await engine.recordRun(20);
    const stats = engine.getStats();
    expect(stats.totalRuns).toBe(2);
    expect(stats.totalScore).toBe(35);
    expect(stats.scores).toEqual([15, 20]);
  });

  it("should record test results", async () => {
    await engine.recordTests(10, 2);
    const stats = engine.getStats();
    expect(stats.testsPassed).toBe(10);
    expect(stats.testsFailed).toBe(2);
  });

  it("should record deploys", async () => {
    await engine.recordDeploy();
    await engine.recordDeploy();
    expect(engine.getStats().deployCount).toBe(2);
  });

  it("should record self-improves", async () => {
    await engine.recordSelfImprove();
    expect(engine.getStats().selfImproveCount).toBe(1);
  });

  it("should have correct thresholds defined", () => {
    expect(PROMOTION_THRESHOLDS[0]).toBeDefined();
    expect(PROMOTION_THRESHOLDS[1]).toBeDefined();
    expect(PROMOTION_THRESHOLDS[2]).toBeDefined();
    expect(PROMOTION_THRESHOLDS[3]).toBeNull(); // Max level
  });

  it("should have level titles", () => {
    expect(LEVEL_TITLES[0]).toBe("Intern (read-only)");
    expect(LEVEL_TITLES[1]).toBe("Junior Developer");
    expect(LEVEL_TITLES[2]).toBe("Mid Developer");
    expect(LEVEL_TITLES[3]).toBe("Senior Developer");
  });

  it("should check promotion eligibility", async () => {
    const check = engine.checkPromotion();
    expect(check.currentLevel).toBe(0);
    expect(check.nextLevel).toBe(1);
    expect(check.eligible).toBe(false);
    expect(check.progress["runs"]).toBeDefined();
    expect(check.progress["runs"]!.met).toBe(false);
  });

  it("should promote from L0 to L1 when thresholds met", async () => {
    // L0 → L1 needs: 5 runs, avg score ≥ 12, test pass ≥ 80%
    await engine.recordTests(10, 1); // 91% pass rate

    // Record 4 runs with high scores — not enough yet
    for (let i = 0; i < 4; i++) {
      const result = await engine.recordRun(15);
      expect(result).toBeNull(); // Not promoted yet
    }
    expect(engine.getLevel()).toBe(0);

    // 5th run triggers promotion
    const promotion = await engine.recordRun(15);
    expect(promotion).not.toBeNull();
    expect(promotion!.fromLevel).toBe(0);
    expect(promotion!.toLevel).toBe(1);
    expect(engine.getLevel()).toBe(1);
    expect(engine.getTitle()).toBe("Junior Developer");
  });

  it("should not promote if avg score too low", async () => {
    await engine.recordTests(10, 1);

    // 5 runs with low scores (avg 8 < 12)
    for (let i = 0; i < 5; i++) {
      const result = await engine.recordRun(8);
      expect(result).toBeNull();
    }
    expect(engine.getLevel()).toBe(0);
  });

  it("should persist stats to disk", async () => {
    await engine.recordRun(20);
    await engine.recordDeploy();

    // Create new engine from same directory
    const engine2 = new PromotionEngine(tmpDir, 0);
    await engine2.initialize();

    expect(engine2.getStats().totalRuns).toBe(1);
    expect(engine2.getStats().deployCount).toBe(1);
  });

  it("should fire onPromotion listeners", async () => {
    let fired = false;
    engine.onPromotion((event) => {
      fired = true;
      expect(event.toLevel).toBe(1);
    });

    await engine.recordTests(10, 0);
    for (let i = 0; i < 5; i++) {
      await engine.recordRun(15);
    }
    expect(fired).toBe(true);
  });

  it("should track promotion history", async () => {
    await engine.recordTests(100, 0);

    // L0 → L1
    for (let i = 0; i < 5; i++) {
      await engine.recordRun(15);
    }
    expect(engine.getLevel()).toBe(1);
    expect(engine.getStats().promotionHistory).toHaveLength(1);
    expect(engine.getStats().promotionHistory[0]!.fromLevel).toBe(0);
    expect(engine.getStats().promotionHistory[0]!.toLevel).toBe(1);
  });

  it("should not promote beyond L3", async () => {
    // Create an engine already at L3
    const maxEngine = new PromotionEngine(path.join(tmpDir, "max"), 3);
    await maxEngine.initialize();

    const check = maxEngine.checkPromotion();
    expect(check.eligible).toBe(false);
    expect(check.nextLevel).toBeNull();
  });

  it("should keep only last 100 scores", async () => {
    await engine.recordTests(1000, 0);
    for (let i = 0; i < 110; i++) {
      await engine.recordRun(15);
    }
    expect(engine.getStats().scores.length).toBeLessThanOrEqual(100);
  });
});

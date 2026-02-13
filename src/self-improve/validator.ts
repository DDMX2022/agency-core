import { execSync } from "node:child_process";
import pino from "pino";

const logger = pino({ name: "self-improve-validator" });

export interface ValidationResult {
  passed: boolean;
  totalTests: number;
  failedTests: number;
  output: string;
  duration: string;
}

/**
 * Validator
 * Runs the test suite and returns whether all tests pass.
 * Used as a gate before committing self-improvements.
 */
export class Validator {
  constructor(private readonly workspaceRoot: string) {}

  /**
   * Run `npx vitest run` and parse the results.
   * Returns a structured result with pass/fail info.
   */
  run(): ValidationResult {
    logger.info("Running test suite...");
    const startTime = Date.now();

    try {
      const output = execSync("npx vitest run 2>&1", {
        cwd: this.workspaceRoot,
        encoding: "utf-8",
        timeout: 120_000, // 2 minute timeout
        env: { ...process.env, FORCE_COLOR: "0" },
      });

      const elapsed = `${((Date.now() - startTime) / 1000).toFixed(1)}s`;
      const { total, failed } = parseTestOutput(output);

      const result: ValidationResult = {
        passed: failed === 0 && total > 0,
        totalTests: total,
        failedTests: failed,
        output: output.slice(-2000), // last 2000 chars
        duration: elapsed,
      };

      logger.info(
        { passed: result.passed, total, failed, duration: elapsed },
        "Test suite complete",
      );
      return result;
    } catch (error) {
      const elapsed = `${((Date.now() - startTime) / 1000).toFixed(1)}s`;
      const output = error instanceof Error ? (error as { stdout?: string }).stdout ?? error.message : String(error);
      const { total, failed } = parseTestOutput(output);

      const result: ValidationResult = {
        passed: false,
        totalTests: total,
        failedTests: Math.max(failed, 1),
        output: typeof output === "string" ? output.slice(-2000) : String(output).slice(-2000),
        duration: elapsed,
      };

      logger.error({ failed: result.failedTests, duration: elapsed }, "Test suite failed");
      return result;
    }
  }
}

/**
 * Parse vitest output to extract test counts.
 * Matches lines like: "Tests  131 passed (131)" or "Tests  2 failed | 129 passed (131)"
 */
export function parseTestOutput(output: string): { total: number; failed: number } {
  // Match total from "(N)" at end of a "Tests" line
  const totalMatch = output.match(/Tests\s+.*\((\d+)\)/);
  const failMatch = output.match(/Tests\s+(\d+)\s+failed/);

  const total = totalMatch ? parseInt(totalMatch[1]!, 10) : 0;
  const failed = failMatch ? parseInt(failMatch[1]!, 10) : 0;

  return { total, failed };
}

import { describe, it, expect } from "vitest";

// Note: We test the utility functions used in the Telegram bot.
// The bot module itself requires TELEGRAM_BOT_TOKEN at the top level
// and calls process.exit(1) if missing, so we can't import from it
// directly in tests. Instead we test the logic by re-implementing
// the pure utility functions here.

function splitMessageFn(text: string): string[] {
  const MAX = 4096;
  if (text.length <= MAX) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX) {
      chunks.push(remaining);
      break;
    }
    let splitIdx = remaining.lastIndexOf("\n", MAX);
    if (splitIdx < MAX / 2) {
      splitIdx = remaining.lastIndexOf(" ", MAX);
    }
    if (splitIdx < MAX / 2) {
      splitIdx = MAX;
    }
    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }

  return chunks;
}

function formatResultFn(artifact: Record<string, unknown>): string {
  const gk = artifact["gatekeeper"] as Record<string, unknown> | undefined;
  const obs = artifact["observer"] as Record<string, unknown> | undefined;

  const lines: string[] = [];
  lines.push("✅ Pipeline Complete\n");

  if (gk) {
    lines.push(`📊 Score: ${gk["totalScore"] ?? "?"}/25`);
    lines.push(`💬 Feedback: ${gk["feedback"] ?? ""}\n`);
  }

  if (obs) {
    const summary = (obs["summary"] as string) ?? "";
    if (summary) {
      lines.push(`🔍 Analysis:\n${summary}\n`);
    }
  }

  lines.push(`🆔 ${artifact["runId"]}`);
  return lines.join("\n");
}

interface OpenClawOutbound {
  type: string;
  runId: string;
  from: string;
  to: string;
  topic: string;
  payload: {
    success: boolean;
    data: unknown;
    summary: string;
    artifactId?: string;
  };
  timestamp: string;
}

function formatOpenClawResultFn(result: OpenClawOutbound): string {
  const lines: string[] = [];
  const payload = result.payload;
  const data = (payload.data ?? {}) as Record<string, unknown>;

  if (payload.success) {
    lines.push("✅ OpenClaw Pipeline Complete\n");
  } else {
    lines.push("⚠️ OpenClaw Pipeline Finished (with issues)\n");
  }

  const summary = payload.summary;
  if (summary) {
    lines.push(`💬 Summary: ${summary}\n`);
  }

  const totalScore = data["totalScore"] as number | undefined;
  if (totalScore !== undefined) {
    lines.push(`📊 Score: ${totalScore}/25`);
  }

  const scorecard = data["scorecard"] as Record<string, number> | undefined;
  if (scorecard) {
    lines.push(`  Correctness:  ${scorecard["correctness"] ?? "?"}/5`);
    lines.push(`  Verification: ${scorecard["verification"] ?? "?"}/5`);
    lines.push(`  Safety:       ${scorecard["safety"] ?? "?"}/5`);
    lines.push(`  Clarity:      ${scorecard["clarity"] ?? "?"}/5`);
    lines.push(`  Autonomy:     ${scorecard["autonomy"] ?? "?"}/5`);
    lines.push("");
  }

  lines.push("");
  lines.push(`📨 Envelope: ${result.from} → ${result.to}`);
  lines.push(`🆔 Run: ${result.runId}`);
  if (payload.artifactId) {
    lines.push(`📦 Artifact: ${payload.artifactId}`);
  }

  return lines.join("\n");
}

describe("Telegram Bot Utilities", () => {
  describe("splitMessage", () => {
    it("should return single chunk for short messages", () => {
      const result = splitMessageFn("Hello world");
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("Hello world");
    });

    it("should split long messages at newlines", () => {
      const longText = Array.from({ length: 100 }, (_, i) => `Line ${i}: ${"x".repeat(50)}`).join(
        "\n"
      );
      const chunks = splitMessageFn(longText);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(4096);
      }
    });

    it("should not lose content when splitting", () => {
      const longText = Array.from({ length: 100 }, (_, i) => `Line ${i}`).join("\n");
      const chunks = splitMessageFn(longText);
      const rejoined = chunks.join("\n");
      expect(rejoined.replace(/\s+/g, " ")).toBe(longText.replace(/\s+/g, " "));
    });
  });

  describe("formatResult", () => {
    it("should format a complete artifact", () => {
      const artifact = {
        runId: "test-run-123",
        gatekeeper: {
          totalScore: 22,
          feedback: "Good work",
        },
        observer: {
          summary: "User wants a REST API",
        },
      };

      const result = formatResultFn(artifact);
      expect(result).toContain("Pipeline Complete");
      expect(result).toContain("22/25");
      expect(result).toContain("Good work");
      expect(result).toContain("REST API");
      expect(result).toContain("test-run-123");
    });

    it("should handle missing gatekeeper gracefully", () => {
      const artifact = { runId: "abc" };
      const result = formatResultFn(artifact);
      expect(result).toContain("Pipeline Complete");
      expect(result).toContain("abc");
    });

    it("should handle missing observer gracefully", () => {
      const artifact = {
        runId: "abc",
        gatekeeper: { totalScore: 20, feedback: "ok" },
      };
      const result = formatResultFn(artifact);
      expect(result).toContain("20/25");
      expect(result).not.toContain("Analysis");
    });
  });

  describe("formatOpenClawResult", () => {
    it("should format a successful OpenClaw result", () => {
      const result: OpenClawOutbound = {
        type: "RESULT",
        runId: "abc-123",
        from: "AgencyCore",
        to: "telegram-user-42",
        topic: "telegram-request",
        payload: {
          success: true,
          data: {
            totalScore: 22,
            scorecard: { correctness: 5, verification: 4, safety: 5, clarity: 4, autonomy: 4 },
            actions: [{ description: "Created user model" }],
            filesCreated: ["src/user.ts"],
            filesModified: [],
            commandsRun: [],
          },
          summary: "Successfully built user management system",
          artifactId: "art-456",
        },
        timestamp: new Date().toISOString(),
      };

      const formatted = formatOpenClawResultFn(result);
      expect(formatted).toContain("OpenClaw Pipeline Complete");
      expect(formatted).toContain("22/25");
      expect(formatted).toContain("Successfully built");
      expect(formatted).toContain("AgencyCore → telegram-user-42");
      expect(formatted).toContain("abc-123");
      expect(formatted).toContain("art-456");
      expect(formatted).toContain("Correctness:  5/5");
    });

    it("should format a failed OpenClaw result", () => {
      const result: OpenClawOutbound = {
        type: "RESULT",
        runId: "fail-123",
        from: "AgencyCore",
        to: "telegram-user-42",
        topic: "telegram-request",
        payload: {
          success: false,
          data: { error: "Something went wrong" },
          summary: "Pipeline failed: timeout",
        },
        timestamp: new Date().toISOString(),
      };

      const formatted = formatOpenClawResultFn(result);
      expect(formatted).toContain("with issues");
      expect(formatted).toContain("Pipeline failed: timeout");
      expect(formatted).toContain("fail-123");
    });

    it("should include envelope routing info", () => {
      const result: OpenClawOutbound = {
        type: "RESULT",
        runId: "route-test",
        from: "AgencyCore",
        to: "telegram-user-99",
        topic: "telegram-request",
        payload: {
          success: true,
          data: {},
          summary: "Done",
        },
        timestamp: new Date().toISOString(),
      };

      const formatted = formatOpenClawResultFn(result);
      expect(formatted).toContain("Envelope: AgencyCore → telegram-user-99");
      expect(formatted).toContain("Run: route-test");
    });
  });
});

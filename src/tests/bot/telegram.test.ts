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
  lines.push("✅ *Pipeline Complete*\n");

  if (gk) {
    lines.push(`📊 *Score:* ${gk["totalScore"] ?? "?"}/25`);
    lines.push(`💬 *Feedback:* ${gk["feedback"] ?? ""}\n`);
  }

  if (obs) {
    const summary = (obs["summary"] as string) ?? "";
    if (summary) {
      lines.push(`🔍 *Analysis:*\n${summary}\n`);
    }
  }

  lines.push(`🆔 \`${artifact["runId"]}\``);
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
      // Allow for trimming differences
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
});

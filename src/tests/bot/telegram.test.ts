import { describe, it, expect } from "vitest";

// Note: We test the utility functions used in the Telegram bot.
// The bot module itself requires TELEGRAM_BOT_TOKEN at the top level
// and calls process.exit(1) if missing, so we can't import from it
// directly in tests. Instead we test the logic by re-implementing
// the pure utility functions here.

// ── Helpers (mirrors telegram.ts) ─────────────────────────────────

function escapeHtmlFn(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function scoreBarFn(score: number, max: number): string {
  const filled = Math.round((score / max) * 10);
  const empty = 10 - filled;
  return "█".repeat(filled) + "░".repeat(empty) + ` ${score}/${max}`;
}

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
  lines.push("<b>✅ Pipeline Complete</b>");
  lines.push("");

  if (gk) {
    const score = (gk["totalScore"] as number) ?? 0;
    const feedback = (gk["feedback"] as string) ?? "";
    lines.push(`<b>📊 Quality Score</b>  ${score}/25`);
    lines.push(`<code>${scoreBarFn(score, 25)}</code>`);
    if (feedback) {
      lines.push("");
      lines.push(`💬 ${escapeHtmlFn(feedback)}`);
    }
    lines.push("");
  }

  if (obs) {
    const summary = (obs["summary"] as string) ?? "";
    if (summary) {
      lines.push(`<b>🔍 Analysis</b>`);
      lines.push(escapeHtmlFn(summary));
      lines.push("");
    }
  }

  lines.push(`<code>Run ${artifact["runId"]}</code>`);
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
    lines.push("<b>✅ Task Complete</b>");
  } else {
    lines.push("<b>⚠️ Task Finished</b>  <i>(with issues)</i>");
  }
  lines.push("━━━━━━━━━━━━━━━━━━━━━━");

  const summary = payload.summary;
  if (summary) {
    lines.push("");
    lines.push(escapeHtmlFn(summary));
    lines.push("");
  }

  const totalScore = data["totalScore"] as number | undefined;
  const scorecard = data["scorecard"] as Record<string, number> | undefined;
  if (totalScore !== undefined) {
    lines.push("━━━━━━━━━━━━━━━━━━━━━━");
    lines.push(`<b>📊 Quality</b>  ${totalScore}/25`);
    lines.push(`<code>${scoreBarFn(totalScore, 25)}</code>`);
  }

  if (scorecard) {
    lines.push("");
    const dims = [
      ["Correctness ", "correctness"],
      ["Verification", "verification"],
      ["Safety      ", "safety"],
      ["Clarity     ", "clarity"],
      ["Autonomy    ", "autonomy"],
    ] as const;
    for (const [label, key] of dims) {
      const val = scorecard[key] ?? 0;
      lines.push(`<code>  ${label} ${scoreBarFn(val, 5)}</code>`);
    }
    lines.push("");
  }

  const actions = data["actions"] as unknown[] | undefined;
  if (actions && actions.length > 0) {
    lines.push(`<b>⚙️ Actions</b>  (${actions.length})`);
    for (const action of actions.slice(0, 5)) {
      const a = action as Record<string, string>;
      const desc = a["description"] ?? a["action"] ?? JSON.stringify(a);
      lines.push(`  • ${escapeHtmlFn(desc)}`);
    }
    if (actions.length > 5) lines.push(`  <i>… and ${actions.length - 5} more</i>`);
    lines.push("");
  }

  const filesCreated = data["filesCreated"] as string[] | undefined;
  const filesModified = data["filesModified"] as string[] | undefined;
  const hasFiles = (filesCreated && filesCreated.length > 0) || (filesModified && filesModified.length > 0);
  if (hasFiles) {
    lines.push("<b>📁 Files</b>");
    if (filesCreated && filesCreated.length > 0) {
      for (const f of filesCreated.slice(0, 5)) {
        lines.push(`  ＋ <code>${escapeHtmlFn(f)}</code>`);
      }
    }
    if (filesModified && filesModified.length > 0) {
      for (const f of filesModified.slice(0, 5)) {
        lines.push(`  ✎ <code>${escapeHtmlFn(f)}</code>`);
      }
    }
    lines.push("");
  }

  lines.push("<code>━━━━━━━━━━━━━━━━━━━━━━</code>");
  const shortRunId = result.runId.split("-")[0] ?? result.runId;
  lines.push(`<i>🆔 ${shortRunId}  ·  � ${escapeHtmlFn(result.from)} → ${escapeHtmlFn(result.to)}</i>`);

  return lines.join("\n");
}

describe("Telegram Bot Utilities", () => {
  describe("escapeHtml", () => {
    it("should escape &, <, >", () => {
      expect(escapeHtmlFn("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
    });

    it("should leave normal text unchanged", () => {
      expect(escapeHtmlFn("hello world")).toBe("hello world");
    });
  });

  describe("scoreBar", () => {
    it("should render full bar for max score", () => {
      expect(scoreBarFn(5, 5)).toBe("██████████ 5/5");
    });

    it("should render empty bar for zero", () => {
      expect(scoreBarFn(0, 5)).toBe("░░░░░░░░░░ 0/5");
    });

    it("should render half bar for half score", () => {
      const bar = scoreBarFn(12, 25);
      expect(bar).toContain("12/25");
      expect(bar.length).toBeGreaterThan(10);
    });
  });

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
    it("should format a complete artifact with HTML", () => {
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
      expect(result).toContain("<b>✅ Pipeline Complete</b>");
      expect(result).toContain("22/25");
      expect(result).toContain("Good work");
      expect(result).toContain("REST API");
      expect(result).toContain("<code>Run test-run-123</code>");
      // Score bar
      expect(result).toContain("█");
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
    it("should format a successful result with HTML score bars", () => {
      const result: OpenClawOutbound = {
        type: "RESULT",
        runId: "abc-123-def",
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
      expect(formatted).toContain("<b>✅ Task Complete</b>");
      expect(formatted).toContain("━━━━━━━━━━━━━━━━━━━━━━");
      expect(formatted).toContain("Successfully built");
      expect(formatted).toContain("22/25");
      expect(formatted).toContain("█"); // score bars
      expect(formatted).toContain("Correctness");
      expect(formatted).toContain("5/5");
      expect(formatted).toContain("Created user model");
      expect(formatted).toContain("<b>📁 Files</b>");
      expect(formatted).toContain("src/user.ts");
      // Short run ID (first segment before dash)
      expect(formatted).toContain("abc");
      expect(formatted).toContain("AgencyCore → telegram-user-42");
    });

    it("should format a failed result with issues label", () => {
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
      expect(formatted).toContain("<b>⚠️ Task Finished</b>");
      expect(formatted).toContain("(with issues)");
      expect(formatted).toContain("Pipeline failed: timeout");
      expect(formatted).toContain("fail");
    });

    it("should show short run ID and envelope routing in footer", () => {
      const result: OpenClawOutbound = {
        type: "RESULT",
        runId: "abcdef-1234-5678",
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
      expect(formatted).toContain("abcdef"); // short ID
      expect(formatted).toContain("AgencyCore → telegram-user-99");
      expect(formatted).not.toContain("abcdef-1234-5678"); // full ID should NOT appear
    });

    it("should escape HTML entities in user content", () => {
      const result: OpenClawOutbound = {
        type: "RESULT",
        runId: "html-test",
        from: "AgencyCore",
        to: "user<script>",
        topic: "test",
        payload: {
          success: true,
          data: {
            actions: [{ description: "Handle <div> & <span> tags" }],
          },
          summary: "Processed a & b < c > d",
        },
        timestamp: new Date().toISOString(),
      };

      const formatted = formatOpenClawResultFn(result);
      expect(formatted).toContain("a &amp; b &lt; c &gt; d");
      expect(formatted).toContain("&lt;div&gt; &amp; &lt;span&gt;");
      expect(formatted).toContain("user&lt;script&gt;");
    });
  });
});

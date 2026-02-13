import "dotenv/config";
import { Bot, InlineKeyboard } from "grammy";
import { v4 as uuidv4 } from "uuid";
import * as path from "node:path";
import pino from "pino";
import { Orchestrator } from "../core/pipeline/orchestrator.js";
import { OpenClawAdapter } from "../integrations/openclaw/openclawAdapter.js";
import type { OpenClawInbound } from "../integrations/openclaw/openclaw.schema.js";
import { createLLMProvider } from "../providers/index.js";

const logger = pino({ name: "telegram-bot" });

// ── Configuration ──────────────────────────────────────────────────
const TOKEN = process.env["TELEGRAM_BOT_TOKEN"];
if (!TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN is required in .env");
  console.error("   Get one from @BotFather on Telegram");
  process.exit(1);
}

const ALLOWED_USERS = process.env["TELEGRAM_ALLOWED_USERS"]
  ? process.env["TELEGRAM_ALLOWED_USERS"].split(",").map((id) => parseInt(id.trim(), 10))
  : []; // empty = allow everyone

const MEMORY_DIR = path.resolve(process.cwd(), "memory");
const WORKSPACE_ROOT = process.cwd();
const MAX_MESSAGE_LENGTH = 4096; // Telegram's limit

// ── Orchestrator & OpenClaw Adapter ────────────────────────────────
const llm = createLLMProvider();
const orchestrator = new Orchestrator({
  llm,
  memoryDir: MEMORY_DIR,
  workspaceRoot: WORKSPACE_ROOT,
});

const openclawSecret = process.env["OPENCLAW_SHARED_SECRET"];
const adapter = new OpenClawAdapter(orchestrator, openclawSecret);

// ── Bot Setup ──────────────────────────────────────────────────────
const bot = new Bot(TOKEN);

// Track active requests to prevent double-processing
const activeRequests = new Set<number>();

/**
 * Split a long message into Telegram-safe chunks.
 */
function splitMessage(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_MESSAGE_LENGTH) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a newline near the limit
    let splitIdx = remaining.lastIndexOf("\n", MAX_MESSAGE_LENGTH);
    if (splitIdx < MAX_MESSAGE_LENGTH / 2) {
      // Fallback: split at a space
      splitIdx = remaining.lastIndexOf(" ", MAX_MESSAGE_LENGTH);
    }
    if (splitIdx < MAX_MESSAGE_LENGTH / 2) {
      // Hard split
      splitIdx = MAX_MESSAGE_LENGTH;
    }

    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }

  return chunks;
}

/**
 * Escape special characters for Telegram MarkdownV2.
 */
function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

/**
 * Format a pipeline result into a readable Telegram message (plain text).
 */
function formatResult(artifact: Record<string, unknown>): string {
  const gk = artifact["gatekeeper"] as Record<string, unknown> | undefined;
  const impl = artifact["implementor"] as Record<string, unknown> | undefined;
  const obs = artifact["observer"] as Record<string, unknown> | undefined;
  const guide = artifact["guide"] as Record<string, unknown> | undefined;

  const lines: string[] = [];

  lines.push("✅ Pipeline Complete\n");

  if (gk) {
    const score = gk["totalScore"] ?? "?";
    const feedback = gk["feedback"] ?? "";
    lines.push(`📊 Score: ${score}/25`);
    lines.push(`💬 Feedback: ${feedback}\n`);
  }

  if (obs) {
    const summary = (obs["summary"] as string) ?? "";
    if (summary) {
      lines.push(`🔍 Analysis:\n${summary}\n`);
    }
  }

  if (guide) {
    const plan = (guide["plan"] as unknown[]) ?? [];
    if (plan.length > 0) {
      lines.push(`📋 Plan: ${plan.length} steps`);
      for (const step of plan.slice(0, 5)) {
        const s = step as Record<string, string>;
        lines.push(`  • ${s["step"] ?? s["description"] ?? JSON.stringify(s)}`);
      }
      if (plan.length > 5) lines.push(`  ... and ${plan.length - 5} more`);
      lines.push("");
    }
  }

  if (impl) {
    const actions = (impl["actions"] as unknown[]) ?? [];
    if (actions.length > 0) {
      lines.push(`⚙️ Actions: ${actions.length} performed`);
      for (const action of actions.slice(0, 5)) {
        const a = action as Record<string, string>;
        lines.push(`  • ${a["description"] ?? a["action"] ?? JSON.stringify(a)}`);
      }
      if (actions.length > 5) lines.push(`  ... and ${actions.length - 5} more`);
      lines.push("");
    }
  }

  lines.push(`🆔 ${artifact["runId"]}`);

  return lines.join("\n");
}

/**
 * Format an OpenClaw RESULT envelope into a readable Telegram message.
 */
function formatOpenClawResult(result: import("../integrations/openclaw/openclaw.schema.js").OpenClawOutbound): string {
  const lines: string[] = [];
  const payload = result.payload as Record<string, unknown>;
  const data = (payload["data"] ?? {}) as Record<string, unknown>;

  if (payload["success"]) {
    lines.push("✅ OpenClaw Pipeline Complete\n");
  } else {
    lines.push("⚠️ OpenClaw Pipeline Finished (with issues)\n");
  }

  // Summary
  const summary = payload["summary"] as string | undefined;
  if (summary) {
    lines.push(`💬 Summary: ${summary}\n`);
  }

  // Score
  const totalScore = data["totalScore"] as number | undefined;
  if (totalScore !== undefined) {
    lines.push(`📊 Score: ${totalScore}/25`);
  }

  // Scorecard
  const scorecard = data["scorecard"] as Record<string, number> | undefined;
  if (scorecard) {
    lines.push(`  Correctness:  ${scorecard["correctness"] ?? "?"}/5`);
    lines.push(`  Verification: ${scorecard["verification"] ?? "?"}/5`);
    lines.push(`  Safety:       ${scorecard["safety"] ?? "?"}/5`);
    lines.push(`  Clarity:      ${scorecard["clarity"] ?? "?"}/5`);
    lines.push(`  Autonomy:     ${scorecard["autonomy"] ?? "?"}/5`);
    lines.push("");
  }

  // Actions
  const actions = data["actions"] as unknown[] | undefined;
  if (actions && actions.length > 0) {
    lines.push(`⚙️ Actions: ${actions.length} performed`);
    for (const action of actions.slice(0, 5)) {
      const a = action as Record<string, string>;
      lines.push(`  • ${a["description"] ?? a["action"] ?? JSON.stringify(a)}`);
    }
    if (actions.length > 5) lines.push(`  ... and ${actions.length - 5} more`);
    lines.push("");
  }

  // Files
  const filesCreated = data["filesCreated"] as string[] | undefined;
  const filesModified = data["filesModified"] as string[] | undefined;
  if (filesCreated && filesCreated.length > 0) {
    lines.push(`📄 Files created: ${filesCreated.join(", ")}`);
  }
  if (filesModified && filesModified.length > 0) {
    lines.push(`✏️ Files modified: ${filesModified.join(", ")}`);
  }

  // Envelope metadata
  lines.push("");
  lines.push(`📨 Envelope: ${result.from} → ${result.to}`);
  lines.push(`🆔 Run: ${result.runId}`);
  if (payload["artifactId"]) {
    lines.push(`📦 Artifact: ${payload["artifactId"]}`);
  }

  return lines.join("\n");
}

// ── Access Control ─────────────────────────────────────────────────
bot.use(async (ctx, next) => {
  if (ALLOWED_USERS.length > 0) {
    const userId = ctx.from?.id;
    if (!userId || !ALLOWED_USERS.includes(userId)) {
      logger.warn({ userId }, "Unauthorized access attempt");
      await ctx.reply("⛔ Unauthorized. Your user ID is not in the allow-list.");
      return;
    }
  }
  await next();
});

// ── /start command ─────────────────────────────────────────────────
bot.command("start", async (ctx) => {
  await ctx.reply(
    `🤖 AgencyCore Bot (OpenClaw-integrated)\n\n` +
      `Provider: ${llm.name}\n\n` +
      `Send me any request and I'll run it through the OpenClaw envelope protocol → 11-agent pipeline:\n\n` +
      `TASK Envelope → Observer → PatternObserver → CruxFinder → Retriever → Guide → Planner → SafetyGuard → Implementor → ToolRunner → Gatekeeper → Learner → RESULT Envelope\n\n` +
      `Commands:\n` +
      `/start – This help message\n` +
      `/health – Check system status\n` +
      `/approvals – List pending approvals\n` +
      `/id – Get your Telegram user ID\n\n` +
      `Just type your request as a normal message!`
  );
});

// ── /health command ────────────────────────────────────────────────
bot.command("health", async (ctx) => {
  const pending = adapter.listPendingApprovals();
  await ctx.reply(
    `🟢 System Status\n\n` +
      `Provider: ${llm.name}\n` +
      `OpenClaw: Integrated\n` +
      `Pending Approvals: ${pending.length}\n` +
      `Time: ${new Date().toISOString()}`
  );
});

// ── /id command ────────────────────────────────────────────────────
bot.command("id", async (ctx) => {
  await ctx.reply(`Your Telegram user ID: ${ctx.from?.id}`);
});

// ── /approvals command ─────────────────────────────────────────────
bot.command("approvals", async (ctx) => {
  const pending = adapter.listPendingApprovals();

  if (pending.length === 0) {
    await ctx.reply("✅ No pending approvals.");
    return;
  }

  for (const approval of pending) {
    const keyboard = new InlineKeyboard()
      .text("✅ Approve", `approve:${approval.runId}`)
      .text("❌ Reject", `reject:${approval.runId}`);

    await ctx.reply(
      `🔔 Pending Approval\n\n` +
        `Action: ${approval.action}\n` +
        `Description: ${approval.description}\n` +
        `From: ${approval.from}\n` +
        `Run ID: ${approval.runId}\n` +
        `Created: ${approval.createdAt}`,
      { reply_markup: keyboard }
    );
  }
});

// ── Callback query handler (approve/reject buttons) ────────────────
bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const userName = ctx.from.first_name ?? `user-${ctx.from.id}`;

  if (data.startsWith("approve:") || data.startsWith("reject:")) {
    const parts = data.split(":");
    const action = parts[0]!;
    const runId = parts[1]!;
    const approved = action === "approve";

    const result = adapter.handleApproval({
      runId,
      approved,
      reason: approved ? "Approved via Telegram" : "Rejected via Telegram",
      approvedBy: userName,
      timestamp: new Date().toISOString(),
    });

    if (result.found) {
      await ctx.answerCallbackQuery({
        text: approved ? "✅ Approved!" : "❌ Rejected!",
      });
      await ctx.editMessageText(
        `${approved ? "✅" : "❌"} ${approved ? "Approved" : "Rejected"} by ${userName}\n\nRun ID: ${runId}`
      );
    } else {
      await ctx.answerCallbackQuery({
        text: "⚠️ Approval not found (may have already been resolved)",
      });
    }
  }
});

// ── Message handler (OpenClaw envelope → pipeline) ─────────────────
bot.on("message:text", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;

  // Ignore empty or very short messages
  if (!text || text.trim().length < 3) {
    await ctx.reply("Please send a longer request (at least 3 characters).");
    return;
  }

  // Prevent double-processing
  if (activeRequests.has(userId)) {
    await ctx.reply("⏳ Your previous request is still processing. Please wait.");
    return;
  }

  activeRequests.add(userId);
  logger.info({ userId, text: text.slice(0, 100) }, "Incoming request via OpenClaw envelope");

  // Send "typing" indicator and a processing message
  await ctx.replyWithChatAction("typing");
  const statusMsg = await ctx.reply("⏳ Running OpenClaw pipeline... this may take a moment.");

  try {
    // Build an OpenClaw TASK envelope from the Telegram message
    const envelope: OpenClawInbound = {
      type: "TASK",
      runId: uuidv4(),
      from: `telegram-user-${userId}`,
      to: "AgencyCore",
      topic: "telegram-request",
      payload: {
        request: text,
        priority: "medium",
        metadata: {
          source: "telegram",
          userId,
          chatId: ctx.chat.id,
          userName: ctx.from.first_name ?? "unknown",
        },
      },
      requiresApproval: false,
      timestamp: new Date().toISOString(),
    };

    // Route through the OpenClaw adapter
    const result = await adapter.handleMessage(envelope);

    // Delete the status message
    try {
      await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id);
    } catch {
      // Ignore if we can't delete
    }

    // Format and send the RESULT envelope as a readable message
    const response = formatOpenClawResult(result);
    const chunks = splitMessage(response);
    for (const chunk of chunks) {
      await ctx.reply(chunk);
    }

    // If the pipeline flagged any actions needing approval, show inline buttons
    const pending = adapter.listPendingApprovals();
    for (const approval of pending) {
      const keyboard = new InlineKeyboard()
        .text("✅ Approve", `approve:${approval.runId}`)
        .text("❌ Reject", `reject:${approval.runId}`);

      await ctx.reply(
        `🔔 Approval Required\n\n` +
          `Action: ${approval.action}\n` +
          `Description: ${approval.description}\n` +
          `Run ID: ${approval.runId}`,
        { reply_markup: keyboard }
      );
    }

    logger.info({ userId, runId: result.runId, success: result.payload.success }, "OpenClaw pipeline complete");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error({ userId, error: message }, "Pipeline error");

    try {
      await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id);
    } catch {
      // Ignore
    }

    await ctx.reply(`❌ Pipeline Error\n\n${message}`);
  } finally {
    activeRequests.delete(userId);
  }
});

// ── Error handler ──────────────────────────────────────────────────
bot.catch((err) => {
  logger.error({ error: err.message }, "Bot error");
});

// ── Launch ─────────────────────────────────────────────────────────
async function main(): Promise<void> {
  await orchestrator.initialize();

  console.log("═══════════════════════════════════════════════════════");
  console.log("  AgencyCore Telegram Bot");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Provider: ${llm.name}`);
  console.log(`  Allowed users: ${ALLOWED_USERS.length > 0 ? ALLOWED_USERS.join(", ") : "everyone"}`);
  console.log("───────────────────────────────────────────────────────");
  console.log("  Starting long polling...\n");

  bot.start();
}

main().catch((err) => {
  console.error("❌ Failed to start bot:", err);
  process.exit(1);
});

export { bot, orchestrator, adapter, formatResult, formatOpenClawResult, splitMessage };

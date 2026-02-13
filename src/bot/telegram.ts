import "dotenv/config";
import { Bot } from "grammy";
import * as path from "node:path";
import pino from "pino";
import { Orchestrator } from "../core/pipeline/orchestrator.js";
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

// ── Orchestrator ───────────────────────────────────────────────────
const llm = createLLMProvider();
const orchestrator = new Orchestrator({
  llm,
  memoryDir: MEMORY_DIR,
  workspaceRoot: WORKSPACE_ROOT,
});

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
 * Format a pipeline result into a readable Telegram message.
 */
function formatResult(artifact: Record<string, unknown>): string {
  const gk = artifact["gatekeeper"] as Record<string, unknown> | undefined;
  const impl = artifact["implementor"] as Record<string, unknown> | undefined;
  const obs = artifact["observer"] as Record<string, unknown> | undefined;
  const guide = artifact["guide"] as Record<string, unknown> | undefined;

  const lines: string[] = [];

  lines.push("✅ *Pipeline Complete*\n");

  if (gk) {
    const score = gk["totalScore"] ?? "?";
    const feedback = gk["feedback"] ?? "";
    lines.push(`📊 *Score:* ${score}/25`);
    lines.push(`💬 *Feedback:* ${feedback}\n`);
  }

  if (obs) {
    const summary = (obs["summary"] as string) ?? "";
    if (summary) {
      lines.push(`🔍 *Analysis:*\n${summary}\n`);
    }
  }

  if (guide) {
    const plan = (guide["plan"] as unknown[]) ?? [];
    if (plan.length > 0) {
      lines.push(`📋 *Plan:* ${plan.length} steps`);
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
      lines.push(`⚙️ *Actions:* ${actions.length} performed`);
      for (const action of actions.slice(0, 5)) {
        const a = action as Record<string, string>;
        lines.push(`  • ${a["description"] ?? a["action"] ?? JSON.stringify(a)}`);
      }
      if (actions.length > 5) lines.push(`  ... and ${actions.length - 5} more`);
      lines.push("");
    }
  }

  lines.push(`🆔 \`${artifact["runId"]}\``);

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
    `🤖 *AgencyCore Bot*\n\n` +
      `Provider: *${llm.name}*\n\n` +
      `Send me any request and I'll run it through the 11-agent pipeline:\n\n` +
      `Observer → PatternObserver → CruxFinder → Retriever → Guide → Planner → SafetyGuard → Implementor → ToolRunner → Gatekeeper → Learner\n\n` +
      `Commands:\n` +
      `/start – This help message\n` +
      `/health – Check system status\n` +
      `/id – Get your Telegram user ID\n\n` +
      `Just type your request as a normal message!`,
    { parse_mode: "Markdown" }
  );
});

// ── /health command ────────────────────────────────────────────────
bot.command("health", async (ctx) => {
  await ctx.reply(
    `🟢 *System Status*\n\n` +
      `Provider: \`${llm.name}\`\n` +
      `Uptime: Running\n` +
      `Time: ${new Date().toISOString()}`,
    { parse_mode: "Markdown" }
  );
});

// ── /id command ────────────────────────────────────────────────────
bot.command("id", async (ctx) => {
  await ctx.reply(`Your Telegram user ID: \`${ctx.from?.id}\``, {
    parse_mode: "Markdown",
  });
});

// ── Message handler (pipeline requests) ────────────────────────────
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
  logger.info({ userId, text: text.slice(0, 100) }, "Incoming request");

  // Send "typing" indicator and a processing message
  await ctx.replyWithChatAction("typing");
  const statusMsg = await ctx.reply("⏳ Running pipeline... this may take a moment.");

  try {
    const artifact = await orchestrator.run(text);
    const response = formatResult(artifact as unknown as Record<string, unknown>);

    // Delete the status message
    try {
      await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id);
    } catch {
      // Ignore if we can't delete
    }

    // Send result (split if too long)
    const chunks = splitMessage(response);
    for (const chunk of chunks) {
      await ctx.reply(chunk, { parse_mode: "Markdown" });
    }

    logger.info({ userId, runId: artifact.runId }, "Pipeline complete");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error({ userId, error: message }, "Pipeline error");

    try {
      await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id);
    } catch {
      // Ignore
    }

    await ctx.reply(`❌ *Pipeline Error*\n\n\`${message}\``, {
      parse_mode: "Markdown",
    });
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

export { bot, orchestrator, formatResult, splitMessage };

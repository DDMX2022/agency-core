import "dotenv/config";
import { Bot, InlineKeyboard } from "grammy";
import { v4 as uuidv4 } from "uuid";
import * as path from "node:path";
import pino from "pino";
import { Orchestrator } from "../core/pipeline/orchestrator.js";
import { OpenClawAdapter } from "../integrations/openclaw/openclawAdapter.js";
import type { OpenClawInbound } from "../integrations/openclaw/openclaw.schema.js";
import { createLLMProvider } from "../providers/index.js";
import { ImprovementLoop } from "../self-improve/loop.js";

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

const improvementLoop = new ImprovementLoop({
  llm,
  memory: orchestrator.getMemory(),
  workspaceRoot: WORKSPACE_ROOT,
  maxPatches: 2,
  minRuns: 1,
  enableGitPush: true,
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
 * Escape special characters for Telegram HTML.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Build a visual score bar: ████░░░░░░ 4/5
 */
function scoreBar(score: number, max: number): string {
  const filled = Math.round((score / max) * 10);
  const empty = 10 - filled;
  return "█".repeat(filled) + "░".repeat(empty) + ` ${score}/${max}`;
}

/**
 * Turn an ImplementorAction object into a short, human-readable line.
 * e.g. "📄 Create src/login.ts" or "▶️ Run npm install"
 */
function formatAction(action: Record<string, unknown>): string {
  const type = action["type"] as string | undefined;
  const rawPath = (action["path"] as string) ?? "";
  // Show just the filename (or last 2 segments) to keep it short
  const shortPath = rawPath.split("/").slice(-2).join("/");

  switch (type) {
    case "createFile":
      return `📄 Create <code>${escapeHtml(shortPath)}</code>`;
    case "editFile":
      return `✏️ Edit <code>${escapeHtml(shortPath)}</code>`;
    case "readFile":
      return `👁 Read <code>${escapeHtml(shortPath)}</code>`;
    case "runCommand":
      return `▶️ Run <code>${escapeHtml((action["command"] as string) ?? "command")}</code>`;
    default: {
      // Fallback: try description/action fields, then a compact summary
      const desc = (action["description"] ?? action["action"]) as string | undefined;
      if (desc) return escapeHtml(desc);
      return escapeHtml(`${type ?? "action"}: ${shortPath || "unknown"}`);
    }
  }
}

/**
 * Format a pipeline result into a beautiful, human-readable Telegram HTML message.
 */
function formatResult(artifact: Record<string, unknown>): string {
  const gk = artifact["gatekeeper"] as Record<string, unknown> | undefined;
  const impl = artifact["implementor"] as Record<string, unknown> | undefined;
  const obs = artifact["observer"] as Record<string, unknown> | undefined;
  const guide = artifact["guide"] as Record<string, unknown> | undefined;

  const lines: string[] = [];

  // ── Header ──
  lines.push("<b>✅ Pipeline Complete</b>");
  lines.push("");

  // ── Gatekeeper Score ──
  if (gk) {
    const score = (gk["totalScore"] as number) ?? 0;
    const feedback = (gk["feedback"] as string) ?? "";
    lines.push(`<b>📊 Quality Score</b>  ${score}/25`);
    lines.push(`<code>${scoreBar(score, 25)}</code>`);
    if (feedback) {
      lines.push("");
      lines.push(`💬 ${escapeHtml(feedback)}`);
    }
    lines.push("");
  }

  // ── Observer Summary ──
  if (obs) {
    const summary = (obs["summary"] as string) ?? "";
    if (summary) {
      lines.push(`<b>🔍 Analysis</b>`);
      lines.push(escapeHtml(summary));
      lines.push("");
    }
  }

  // ── Guide Plan ──
  if (guide) {
    const plan = (guide["plan"] as unknown[]) ?? [];
    if (plan.length > 0) {
      lines.push(`<b>📋 Plan</b>  (${plan.length} steps)`);
      for (const step of plan.slice(0, 5)) {
        const s = step as Record<string, string>;
        const label = s["action"] ?? s["step"] ?? s["description"] ?? JSON.stringify(s);
        lines.push(`  → ${escapeHtml(label)}`);
      }
      if (plan.length > 5) lines.push(`  <i>… and ${plan.length - 5} more</i>`);
      lines.push("");
    }
  }

  // ── Implementor Actions ──
  if (impl) {
    const actions = (impl["actions"] as unknown[]) ?? [];
    if (actions.length > 0) {
      lines.push(`<b>⚙️ Actions</b>  (${actions.length} performed)`);
      for (const action of actions.slice(0, 6)) {
        lines.push(`  ${formatAction(action as Record<string, unknown>)}`);
      }
      if (actions.length > 6) lines.push(`  <i>… and ${actions.length - 6} more</i>`);
      lines.push("");
    }
  }

  // ── Footer ──
  lines.push(`<code>Run ${artifact["runId"]}</code>`);

  return lines.join("\n");
}

/**
 * Format an OpenClaw RESULT envelope into a beautiful, human-readable Telegram HTML message.
 */
function formatOpenClawResult(result: import("../integrations/openclaw/openclaw.schema.js").OpenClawOutbound): string {
  const lines: string[] = [];
  const payload = result.payload as Record<string, unknown>;
  const data = (payload["data"] ?? {}) as Record<string, unknown>;

  // ── Header ──
  if (payload["success"]) {
    lines.push("<b>✅ Task Complete</b>");
  } else {
    lines.push("<b>⚠️ Task Finished</b>  <i>(with issues)</i>");
  }
  lines.push("━━━━━━━━━━━━━━━━━━━━━━");

  // ── Summary (the main human-readable answer) ──
  const summary = payload["summary"] as string | undefined;
  if (summary) {
    lines.push("");
    lines.push(escapeHtml(summary));
    lines.push("");
  }

  // ── Score ──
  const totalScore = data["totalScore"] as number | undefined;
  const scorecard = data["scorecard"] as Record<string, number> | undefined;
  if (totalScore !== undefined) {
    lines.push("━━━━━━━━━━━━━━━━━━━━━━");
    lines.push(`<b>📊 Quality</b>  ${totalScore}/25`);
    lines.push(`<code>${scoreBar(totalScore, 25)}</code>`);
  }

  // ── Scorecard Breakdown ──
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
      lines.push(`<code>  ${label} ${scoreBar(val, 5)}</code>`);
    }
    lines.push("");
  }

  // ── Actions ──
  const actions = data["actions"] as unknown[] | undefined;
  if (actions && actions.length > 0) {
    lines.push(`<b>⚙️ Actions</b>  (${actions.length})`);
    for (const action of actions.slice(0, 6)) {
      lines.push(`  ${formatAction(action as Record<string, unknown>)}`);
    }
    if (actions.length > 6) lines.push(`  <i>… and ${actions.length - 6} more</i>`);
    lines.push("");
  }

  // ── Files ──
  const filesCreated = data["filesCreated"] as string[] | undefined;
  const filesModified = data["filesModified"] as string[] | undefined;
  const hasFiles = (filesCreated && filesCreated.length > 0) || (filesModified && filesModified.length > 0);
  if (hasFiles) {
    lines.push("<b>� Files</b>");
    if (filesCreated && filesCreated.length > 0) {
      for (const f of filesCreated.slice(0, 5)) {
        lines.push(`  ＋ <code>${escapeHtml(f)}</code>`);
      }
      if (filesCreated.length > 5) lines.push(`  <i>… and ${filesCreated.length - 5} more</i>`);
    }
    if (filesModified && filesModified.length > 0) {
      for (const f of filesModified.slice(0, 5)) {
        lines.push(`  ✎ <code>${escapeHtml(f)}</code>`);
      }
      if (filesModified.length > 5) lines.push(`  <i>… and ${filesModified.length - 5} more</i>`);
    }
    lines.push("");
  }

  // ── Footer ──
  lines.push("<code>━━━━━━━━━━━━━━━━━━━━━━</code>");
  const shortRunId = result.runId.split("-")[0] ?? result.runId;
  lines.push(`<i>🆔 ${shortRunId}  ·  📨 ${escapeHtml(result.from)} → ${escapeHtml(result.to)}</i>`);

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
  const name = ctx.from?.first_name ?? "there";
  await ctx.reply(
    `<b>👋 Hey ${escapeHtml(name)}!</b>\n\n` +
      `I'm <b>AgencyCore</b> — your AI agency runtime.\n\n` +
      `Just send me any task and I'll run it through an <b>11-agent pipeline</b> powered by <b>${escapeHtml(llm.name)}</b>:\n\n` +
      `<code>You → Observer → Pattern → Crux → Retriever\n` +
      `→ Guide → Planner → Safety → Implementor\n` +
      `→ ToolRunner → Gatekeeper → Learner → You</code>\n\n` +
      `<b>Commands</b>\n` +
      `/start  — This message\n` +
      `/health — System status\n` +
      `/improve — Self-improvement cycle\n` +
      `/approvals — Pending actions\n` +
      `/id — Your Telegram ID\n\n` +
      `<i>Just type your request to get started! 🚀</i>`,
    { parse_mode: "HTML" }
  );
});

// ── /health command ────────────────────────────────────────────────
bot.command("health", async (ctx) => {
  const pending = adapter.listPendingApprovals();
  const uptime = process.uptime();
  const hrs = Math.floor(uptime / 3600);
  const mins = Math.floor((uptime % 3600) / 60);
  const uptimeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

  await ctx.reply(
    `<b>🟢 System Status</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `<b>Engine</b>    ${escapeHtml(llm.name)}\n` +
      `<b>OpenClaw</b>  ✅ Integrated\n` +
      `<b>Agents</b>    11 active\n` +
      `<b>Approvals</b> ${pending.length} pending\n` +
      `<b>Uptime</b>    ${uptimeStr}\n\n` +
      `<code>━━━━━━━━━━━━━━━━━━━━━━</code>\n` +
      `<i>${new Date().toLocaleString()}</i>`,
    { parse_mode: "HTML" }
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
    await ctx.reply("✅ No pending approvals — you're all clear!", { parse_mode: "HTML" });
    return;
  }

  await ctx.reply(`<b>🔔 ${pending.length} Pending Approval${pending.length > 1 ? "s" : ""}</b>`, { parse_mode: "HTML" });

  for (const approval of pending) {
    const keyboard = new InlineKeyboard()
      .text("✅ Approve", `approve:${approval.runId}`)
      .text("❌ Reject", `reject:${approval.runId}`);

    const shortId = approval.runId.split("-")[0] ?? approval.runId;
    await ctx.reply(
      `<b>📋 ${escapeHtml(approval.action)}</b>\n\n` +
        `${escapeHtml(approval.description)}\n\n` +
        `<i>From: ${escapeHtml(approval.from)}  ·  🆔 ${shortId}</i>`,
      { reply_markup: keyboard, parse_mode: "HTML" }
    );
  }
});

// ── /improve command (Self-Improvement) ────────────────────────────
bot.command("improve", async (ctx) => {
  if (improvementLoop.isRunning()) {
    await ctx.reply("<i>⏳ A self-improvement cycle is already running…</i>", { parse_mode: "HTML" });
    return;
  }

  await ctx.reply(
    "🧬 <b>Starting Self-Improvement Cycle</b>\n\n" +
      "<code>1. Analyze portfolio → find weak scores\n" +
      "2. Generate code patches via LLM\n" +
      "3. Run tests → validate changes\n" +
      "4. Await YOUR approval before pushing</code>\n\n" +
      "<i>This may take a minute…</i>",
    { parse_mode: "HTML" },
  );
  await ctx.replyWithChatAction("typing");

  try {
    const result = await improvementLoop.runCycle();

    const lines: string[] = [];

    // Header
    if (result.pendingApproval) {
      lines.push("<b>⏳ Improvements Ready — Awaiting Approval</b>");
    } else if (result.success) {
      lines.push("<b>✅ Self-Improvement Complete</b>");
    } else {
      lines.push("<b>⚠️ Self-Improvement Cycle Finished</b>");
    }
    lines.push("━━━━━━━━━━━━━━━━━━━━━━");
    lines.push("");

    // Analysis summary
    lines.push(`<b>📊 Portfolio</b>  ${result.analysis.totalRuns} runs analyzed`);
    if (result.analysis.totalRuns > 0) {
      lines.push(`  Avg Score: ${result.analysis.averageTotalScore}/25`);
      lines.push(`  Best: ${result.analysis.bestScore}/25  ·  Worst: ${result.analysis.worstScore}/25`);
    }
    lines.push("");

    // Weaknesses
    if (result.analysis.weaknesses.length > 0) {
      lines.push(`<b>🔍 Weaknesses Found</b>  (${result.analysis.weaknesses.length})`);
      for (const w of result.analysis.weaknesses) {
        lines.push(`  <code>${w.dimension.padEnd(14)} ${scoreBar(w.averageScore, 5)}</code>`);
      }
      lines.push("");
    }

    // Patches
    if (result.patches.length > 0) {
      lines.push(`<b>🔧 Patches</b>  (${result.patches.length})`);
      for (const p of result.patches) {
        const shortFile = p.filePath.split("/").slice(-2).join("/");
        lines.push(`  ✏️ <code>${escapeHtml(shortFile)}</code> → ${escapeHtml(p.targetDimension)}`);
      }
      lines.push("");
    }

    // Tests
    if (result.validation) {
      const v = result.validation;
      if (v.passed) {
        lines.push(`<b>✅ Tests</b>  ${v.totalTests} passed in ${v.duration}`);
      } else {
        lines.push(`<b>❌ Tests</b>  ${v.failedTests} failed / ${v.totalTests} total`);
      }
      lines.push("");
    }

    // Summary
    lines.push("<code>━━━━━━━━━━━━━━━━━━━━━━</code>");
    lines.push(`<i>${escapeHtml(result.summary.split("\n")[0] ?? "Done")}</i>`);

    const responseText = lines.join("\n");

    // If pending approval → show approve / reject buttons
    if (result.pendingApproval) {
      await ctx.reply(responseText, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Approve Push", callback_data: "improve_approve" },
              { text: "❌ Reject & Revert", callback_data: "improve_reject" },
            ],
          ],
        },
      });
    } else {
      // No approval needed (no patches, dry-run, or test failure)
      const chunks = splitMessage(responseText);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "HTML" });
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await ctx.reply(
      `<b>❌ Self-Improvement Failed</b>\n\n<code>${escapeHtml(msg)}</code>`,
      { parse_mode: "HTML" },
    );
  }
});

// ── Callback query handler (approve/reject buttons) ────────────────
bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const userName = ctx.from.first_name ?? `user-${ctx.from.id}`;

  // ── Self-Improvement push approval ──────────────────────────────
  if (data === "improve_approve") {
    if (!improvementLoop.hasPendingApproval()) {
      await ctx.answerCallbackQuery({ text: "⚠️ No pending improvements" });
      return;
    }

    await ctx.answerCallbackQuery({ text: "✅ Pushing to GitHub…" });
    await ctx.editMessageText(
      "<b>🚀 Push approved!</b>\n\n<i>Committing and pushing to GitHub…</i>",
      { parse_mode: "HTML" },
    );

    try {
      const pushResult = await improvementLoop.approvePush();

      const lines: string[] = [];
      if (pushResult.success && pushResult.git) {
        lines.push("<b>✅ Pushed to GitHub</b>");
        lines.push("━━━━━━━━━━━━━━━━━━━━━━");
        lines.push(`<b>🔗 Commit:</b> <code>${pushResult.git.commitHash}</code>`);
        lines.push(`<b>🌿 Branch:</b> <code>${escapeHtml(pushResult.git.branch)}</code>`);
        lines.push(`<b>📦 Patches:</b> ${pushResult.patches.length}`);
        lines.push(`<b>✅ Tests:</b> ${pushResult.validation?.totalTests ?? 0} passing`);
      } else {
        lines.push("<b>❌ Push Failed</b>");
        lines.push(`<i>${escapeHtml(pushResult.summary)}</i>`);
      }

      await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await ctx.reply(`<b>❌ Push Failed</b>\n\n<code>${escapeHtml(msg)}</code>`, { parse_mode: "HTML" });
    }
    return;
  }

  if (data === "improve_reject") {
    if (!improvementLoop.hasPendingApproval()) {
      await ctx.answerCallbackQuery({ text: "⚠️ No pending improvements" });
      return;
    }

    await ctx.answerCallbackQuery({ text: "❌ Reverting changes…" });

    try {
      const rejectResult = await improvementLoop.rejectPush();
      await ctx.editMessageText(
        "<b>🚫 Push Rejected</b>\n\n" +
          `<i>${escapeHtml(rejectResult.summary)}</i>\n\n` +
          "All patched files have been reverted to their originals.",
        { parse_mode: "HTML" },
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await ctx.reply(`<b>❌ Revert Failed</b>\n\n<code>${escapeHtml(msg)}</code>`, { parse_mode: "HTML" });
    }
    return;
  }

  // ── OpenClaw pipeline approval ──────────────────────────────────
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
      const shortId = runId.split("-")[0] ?? runId;
      await ctx.editMessageText(
        `${approved ? "✅" : "❌"} <b>${approved ? "Approved" : "Rejected"}</b> by ${escapeHtml(userName)}\n\n` +
          `<i>🆔 ${shortId}</i>`,
        { parse_mode: "HTML" }
      );
    } else {
      await ctx.answerCallbackQuery({
        text: "⚠️ Already resolved",
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
    await ctx.reply("<i>⏳ Still working on your last request…</i>", { parse_mode: "HTML" });
    return;
  }

  activeRequests.add(userId);
  logger.info({ userId, text: text.slice(0, 100) }, "Incoming request via OpenClaw envelope");

  // Send "typing" indicator and a processing message
  await ctx.replyWithChatAction("typing");
  const statusMsg = await ctx.reply("🧠 <i>Thinking… running 11 agents on your request.</i>", { parse_mode: "HTML" });

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
      await ctx.reply(chunk, { parse_mode: "HTML" });
    }

    // If the pipeline flagged any actions needing approval, show inline buttons
    const pending = adapter.listPendingApprovals();
    for (const approval of pending) {
      const keyboard = new InlineKeyboard()
        .text("✅ Approve", `approve:${approval.runId}`)
        .text("❌ Reject", `reject:${approval.runId}`);

      const shortId = approval.runId.split("-")[0] ?? approval.runId;
      await ctx.reply(
        `<b>🔔 Approval Required</b>\n\n` +
          `<b>${escapeHtml(approval.action)}</b>\n` +
          `${escapeHtml(approval.description)}\n\n` +
          `<i>🆔 ${shortId}</i>`,
        { reply_markup: keyboard, parse_mode: "HTML" }
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

    await ctx.reply(
      `<b>❌ Something went wrong</b>\n\n` +
        `<code>${escapeHtml(message)}</code>\n\n` +
        `<i>Try again or rephrase your request.</i>`,
      { parse_mode: "HTML" }
    );
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

export { bot, orchestrator, adapter, formatResult, formatOpenClawResult, splitMessage, escapeHtml, scoreBar, formatAction };

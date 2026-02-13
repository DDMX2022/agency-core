# Telegram Bot Integration

AgencyCore includes a built-in Telegram bot that bridges your messages directly to the 11-agent pipeline.

## Quick Start

### 1. Create a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Follow the prompts to name your bot
4. Copy the **bot token** you receive

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
OPENAI_API_KEY=sk-proj-your-real-key-here
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
```

### 3. Start the Bot

```bash
pnpm bot:telegram
```

You should see:

```
═══════════════════════════════════════════════════════
  AgencyCore Telegram Bot
═══════════════════════════════════════════════════════
  Provider: OpenAI/gpt-4o
  Allowed users: everyone
───────────────────────────────────────────────────────
  Starting long polling...
```

### 4. Chat with Your Bot

Open Telegram, find your bot, and send any message:

```
Build me a REST API for a todo app
```

The bot will:
1. Show a "processing" indicator
2. Run your request through all 11 agents
3. Return a formatted result with score, analysis, plan, and actions

## Bot Commands

| Command | Description |
| ------- | ----------- |
| `/start` | Welcome message and help |
| `/health` | System status and provider info |
| `/id` | Get your Telegram user ID (for access control) |

## Access Control

To restrict who can use the bot, set `TELEGRAM_ALLOWED_USERS` in `.env`:

```env
# Only allow these Telegram user IDs
TELEGRAM_ALLOWED_USERS=123456789,987654321
```

To find your user ID, send `/id` to the bot before enabling the restriction.

If `TELEGRAM_ALLOWED_USERS` is empty or unset, **everyone** can use the bot.

## Architecture

```
┌─────────────────┐
│  Telegram User   │
│  sends message   │
└────────┬────────┘
         │
    ┌────▼────┐
    │  Grammy  │  (Telegram Bot Framework)
    │   Bot    │
    └────┬────┘
         │
    ┌────▼──────────────┐
    │   Orchestrator     │
    │                    │
    │  Observer          │
    │  PatternObserver   │
    │  CruxFinder        │
    │  Retriever         │
    │  Guide             │
    │  Planner           │
    │  SafetyGuard       │
    │  Implementor       │
    │  ToolRunner        │
    │  Gatekeeper        │
    │  Learner           │
    └────┬──────────────┘
         │
    ┌────▼────┐
    │ Format  │
    │ Result  │
    └────┬────┘
         │
    ┌────▼─────────────┐
    │  Telegram Reply   │
    │  (with Markdown)  │
    └──────────────────┘
```

## LLM Provider Auto-Detection

The bot uses the same provider factory as the server and CLI:

| Environment | Provider Used |
| ----------- | ------------- |
| `OPENAI_API_KEY` set | OpenAI GPT-4o |
| No key set | MockLLM (test mode) |

You can override with the `LLM_PROVIDER` concept:

```typescript
import { createLLMProvider } from "../providers/index.js";

// Force a specific provider
const llm = createLLMProvider({ forceProvider: "openai", model: "gpt-4o-mini" });
const llm = createLLMProvider({ forceProvider: "mock" });
```

## Running Alongside the Server

You can run both the HTTP server and Telegram bot simultaneously:

```bash
# Terminal 1 – HTTP API
pnpm dev

# Terminal 2 – Telegram Bot
pnpm bot:telegram
```

Both share the same memory directory, so lessons and portfolio entries are synced.

## Troubleshooting

| Issue | Solution |
| ----- | -------- |
| "TELEGRAM_BOT_TOKEN is required" | Add your bot token to `.env` |
| "OPENAI_API_KEY is required" | Add your OpenAI key to `.env` or it will use MockLLM |
| Bot not responding | Check if the bot is running (`pnpm bot:telegram`) |
| "Unauthorized" message | Add your user ID to `TELEGRAM_ALLOWED_USERS` |
| Long response times | Normal for real LLM — 11 agents each make an API call |

## WhatsApp (Future)

WhatsApp integration requires the WhatsApp Business API (Meta Cloud API) which needs:
- A Meta Business account
- A verified phone number
- A webhook URL (requires hosting)

This is significantly more complex than Telegram. The architecture would be similar — a webhook handler that bridges to the orchestrator — but requires HTTPS hosting and Meta app review.

import "dotenv/config";
import Fastify from "fastify";
import { Orchestrator } from "../core/pipeline/orchestrator.js";
import { createLLMProvider } from "../providers/index.js";
import { registerOpenClawRoutes } from "../integrations/openclaw/openclawRoutes.js";
import { ProductScaffolder } from "../core/products/productScaffolder.js";
import type { ScaffoldRequest } from "../core/products/product.schema.js";
import * as path from "node:path";

const MEMORY_DIR = path.resolve(process.cwd(), "memory");
const WORKSPACE_ROOT = process.cwd();

export function buildServer() {
  const fastify = Fastify({ logger: true });

  const llm = createLLMProvider();
  const orchestrator = new Orchestrator({
    llm,
    memoryDir: MEMORY_DIR,
    workspaceRoot: WORKSPACE_ROOT,
  });

  // Initialize memory directories on startup
  fastify.addHook("onReady", async () => {
    await orchestrator.initialize();
  });

  // ── POST /run ─────────────────────────────────────────────────────
  fastify.post<{ Body: { request: string } }>("/run", {
    schema: {
      body: {
        type: "object",
        required: ["request"],
        properties: {
          request: { type: "string", minLength: 1 },
        },
      },
    },
    handler: async (req, reply) => {
      try {
        const artifact = await orchestrator.run(req.body.request);
        return reply.code(200).send(artifact);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return reply.code(500).send({ error: message });
      }
    },
  });

  // ── GET /runs/:id ─────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>("/runs/:id", async (req, reply) => {
    const artifact = await orchestrator.getMemory().loadRunArtifact(req.params.id);
    if (!artifact) {
      return reply.code(404).send({ error: `Run ${req.params.id} not found` });
    }
    return reply.code(200).send(artifact);
  });

  // ── GET /memory/lessons ───────────────────────────────────────────
  fastify.get("/memory/lessons", async (_req, reply) => {
    const lessons = await orchestrator.getMemory().listLessons();
    return reply.code(200).send({ lessons, count: lessons.length });
  });

  // ── GET /memory/portfolio ─────────────────────────────────────────
  fastify.get("/memory/portfolio", async (_req, reply) => {
    const entries = await orchestrator.getMemory().listPortfolio();
    return reply.code(200).send({ entries, count: entries.length });
  });

  // ── Health check ──────────────────────────────────────────────────
  fastify.get("/health", async () => {
    return { status: "ok", provider: llm.name, timestamp: new Date().toISOString() };
  });

  // ── OpenClaw Integration Routes ─────────────────────────────────────
  registerOpenClawRoutes(fastify, orchestrator);

  // ── Product Scaffolder Route ────────────────────────────────────────
  const scaffolder = new ProductScaffolder();

  fastify.post<{ Body: ScaffoldRequest }>("/products/scaffold", {
    schema: {
      body: {
        type: "object",
        required: ["name", "template", "description"],
        properties: {
          name: { type: "string" },
          template: { type: "string" },
          description: { type: "string" },
          features: { type: "array", items: { type: "string" } },
          includeTests: { type: "boolean" },
          gitPlan: { type: "boolean" },
        },
      },
    },
    handler: async (req, reply) => {
      try {
        const result = scaffolder.scaffold(req.body);
        return reply.code(200).send(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return reply.code(500).send({ error: message });
      }
    },
  });

  return fastify;
}

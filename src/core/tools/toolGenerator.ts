import pino from "pino";
import { ToolSpecSchema, type ToolSpec, type ToolManifest } from "./toolManifest.schema.js";
import { ToolRegistry, type ToolHandler } from "./toolRegistry.js";
import {
  agentModuleTemplate,
  testTemplate,
  manifestJsonTemplate,
  skillMdTemplate,
  examplesMdTemplate,
} from "./toolTemplates/index.js";

const logger = pino({ name: "tool-generator" });

// ── Generated file descriptor ─────────────────────────────────────────

export interface GeneratedFile {
  /** Relative path from output root */
  path: string;
  /** File content */
  content: string;
}

export interface GeneratorResult {
  /** The validated manifest */
  manifest: ToolManifest;
  /** All generated files */
  files: GeneratedFile[];
  /** Whether the tool was auto-registered */
  registered: boolean;
}

// ── ToolGenerator ─────────────────────────────────────────────────────

export class ToolGenerator {
  private readonly registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  /**
   * Generate a full tool from a spec.
   *
   * Produces:
   *   tools/<name>/            – agent module + test + tool.json
   *   openclaw-skills/<name>/  – SKILL.md + tool.json + examples.md
   *
   * Then auto-registers the tool in the registry with a stub handler.
   */
  generate(spec: ToolSpec): GeneratorResult {
    // Validate the spec
    const validated = ToolSpecSchema.parse(spec);
    const name = toKebabCase(validated.name);

    logger.info({ tool: name }, "Generating tool");

    // Build manifest
    const manifest: ToolManifest = {
      name,
      version: "1.0.0",
      description: validated.description,
      inputSchema: validated.inputs as Record<string, unknown>,
      outputSchema: validated.outputs as Record<string, unknown>,
      permissions: {
        level: validated.permissionLevel,
        description: `Requires permission level ${validated.permissionLevel}`,
      },
      requiresApprovalFor: validated.requiresApprovalFor,
      entrypoint: `./${name}.js`,
      tags: validated.tags,
      author: "AgencyCore ToolGenerator",
      createdAt: new Date().toISOString(),
    };

    const specWithDefaults: ToolSpec = {
      ...validated,
      name,
    };

    // Generate all files
    const files: GeneratedFile[] = [
      // Agent module
      { path: `tools/${name}/${name}.ts`, content: agentModuleTemplate(specWithDefaults) },
      // Test
      { path: `tools/${name}/${name}.test.ts`, content: testTemplate(specWithDefaults) },
      // Tool manifest JSON
      { path: `tools/${name}/tool.json`, content: manifestJsonTemplate(specWithDefaults) },
      // OpenClaw skill pack
      { path: `openclaw-skills/${name}/SKILL.md`, content: skillMdTemplate(specWithDefaults) },
      { path: `openclaw-skills/${name}/tool.json`, content: manifestJsonTemplate(specWithDefaults) },
      { path: `openclaw-skills/${name}/examples.md`, content: examplesMdTemplate(specWithDefaults) },
    ];

    // Auto-register with a stub handler
    let registered = false;
    if (!this.registry.has(name)) {
      const stubHandler: ToolHandler = async (_inputs) => {
        return { message: `Stub handler for "${name}" – implement in ${name}.ts` };
      };
      this.registry.register(manifest, stubHandler);
      registered = true;
      logger.info({ tool: name }, "Tool auto-registered with stub handler");
    }

    logger.info({ tool: name, fileCount: files.length }, "Tool generation complete");

    return { manifest, files, registered };
  }
}

// ── Helper ────────────────────────────────────────────────────────────

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

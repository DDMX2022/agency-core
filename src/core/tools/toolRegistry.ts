import pino from "pino";
import { ToolManifestSchema, type ToolManifest } from "./toolManifest.schema.js";

const logger = pino({ name: "tool-registry" });

/**
 * Executable tool handler.
 * Receives validated inputs, returns output object.
 */
export type ToolHandler = (inputs: Record<string, unknown>) => Promise<Record<string, unknown>>;

/**
 * Registered tool = manifest + handler.
 */
export interface RegisteredTool {
  manifest: ToolManifest;
  handler: ToolHandler;
}

/**
 * ToolRegistry – in-memory catalog of available tools.
 *
 * Responsibilities:
 *   • register(manifest, handler)  – validates manifest then stores it
 *   • list()                       – returns all registered manifests
 *   • get(name)                    – returns manifest + handler by name
 *   • execute(name, inputs)        – validates permission, runs handler
 *   • has(name)                    – check if a tool is registered
 *   • unregister(name)             – remove a tool
 */
export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  /**
   * Register a new tool. Validates the manifest against the schema.
   * Throws if the manifest is invalid or the name is already taken.
   */
  register(manifest: ToolManifest, handler: ToolHandler): void {
    // Validate the manifest
    ToolManifestSchema.parse(manifest);

    if (this.tools.has(manifest.name)) {
      throw new Error(`Tool "${manifest.name}" is already registered`);
    }

    this.tools.set(manifest.name, { manifest, handler });
    logger.info({ tool: manifest.name, version: manifest.version }, "Tool registered");
  }

  /**
   * List all registered tool manifests.
   */
  list(): ToolManifest[] {
    return Array.from(this.tools.values()).map((t) => t.manifest);
  }

  /**
   * Get a registered tool by name. Returns undefined if not found.
   */
  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool is registered.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Unregister a tool by name. Returns true if the tool was found and removed.
   */
  unregister(name: string): boolean {
    const removed = this.tools.delete(name);
    if (removed) {
      logger.info({ tool: name }, "Tool unregistered");
    }
    return removed;
  }

  /**
   * Execute a registered tool.
   *
   * @param name          Tool name
   * @param inputs        Input object (validated by the handler)
   * @param callerLevel   Permission level of the caller (0-3)
   * @returns             Output from the handler
   */
  async execute(
    name: string,
    inputs: Record<string, unknown>,
    callerLevel: number = 0,
  ): Promise<Record<string, unknown>> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" not found in registry`);
    }

    // Permission check
    if (callerLevel < tool.manifest.permissions.level) {
      throw new Error(
        `Insufficient permission: tool "${name}" requires level ${tool.manifest.permissions.level}, caller has level ${callerLevel}`,
      );
    }

    logger.info({ tool: name, callerLevel }, "Executing tool");

    try {
      const result = await tool.handler(inputs);
      logger.info({ tool: name, success: true }, "Tool execution complete");
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error({ tool: name, error: message }, "Tool execution failed");
      throw new Error(`Tool "${name}" execution failed: ${message}`);
    }
  }

  /**
   * Return the number of registered tools.
   */
  get size(): number {
    return this.tools.size;
  }
}

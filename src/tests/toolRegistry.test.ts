import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../core/tools/toolRegistry.js";
import type { ToolManifest } from "../core/tools/toolManifest.schema.js";

function makeManifest(overrides: Partial<ToolManifest> = {}): ToolManifest {
  return {
    name: "test-tool",
    version: "1.0.0",
    description: "A test tool",
    inputSchema: { query: "string" },
    outputSchema: { result: "string" },
    permissions: { level: 0, description: "No permissions needed" },
    requiresApprovalFor: [],
    entrypoint: "./test-tool.js",
    tags: ["test"],
    author: "test",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("ToolRegistry", () => {
  it("should register a tool and list it", () => {
    const registry = new ToolRegistry();
    const manifest = makeManifest();
    const handler = async () => ({ result: "ok" });

    registry.register(manifest, handler);

    expect(registry.size).toBe(1);
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0]!.name).toBe("test-tool");
  });

  it("should reject duplicate registration", () => {
    const registry = new ToolRegistry();
    const manifest = makeManifest();
    const handler = async () => ({ result: "ok" });

    registry.register(manifest, handler);
    expect(() => registry.register(manifest, handler)).toThrow("already registered");
  });

  it("should get a tool by name", () => {
    const registry = new ToolRegistry();
    const manifest = makeManifest();
    const handler = async () => ({ result: "ok" });

    registry.register(manifest, handler);

    const tool = registry.get("test-tool");
    expect(tool).toBeDefined();
    expect(tool!.manifest.name).toBe("test-tool");
  });

  it("should return undefined for unknown tool", () => {
    const registry = new ToolRegistry();
    expect(registry.get("nope")).toBeUndefined();
  });

  it("should execute a tool", async () => {
    const registry = new ToolRegistry();
    const manifest = makeManifest();
    const handler = async (inputs: Record<string, unknown>) => ({
      result: `Processed: ${inputs["query"]}`,
    });

    registry.register(manifest, handler);

    const output = await registry.execute("test-tool", { query: "hello" });
    expect(output["result"]).toBe("Processed: hello");
  });

  it("should reject execution with insufficient permission", async () => {
    const registry = new ToolRegistry();
    const manifest = makeManifest({
      name: "secure-tool",
      permissions: { level: 2, description: "Needs L2" },
    });
    const handler = async () => ({ result: "ok" });

    registry.register(manifest, handler);

    await expect(registry.execute("secure-tool", {}, 1)).rejects.toThrow(
      "Insufficient permission",
    );
  });

  it("should allow execution with sufficient permission", async () => {
    const registry = new ToolRegistry();
    const manifest = makeManifest({
      name: "secure-tool",
      permissions: { level: 2, description: "Needs L2" },
    });
    const handler = async () => ({ result: "ok" });

    registry.register(manifest, handler);

    const output = await registry.execute("secure-tool", {}, 2);
    expect(output["result"]).toBe("ok");
  });

  it("should throw when executing unknown tool", async () => {
    const registry = new ToolRegistry();
    await expect(registry.execute("nope", {})).rejects.toThrow("not found");
  });

  it("should unregister a tool", () => {
    const registry = new ToolRegistry();
    registry.register(makeManifest(), async () => ({}));

    expect(registry.has("test-tool")).toBe(true);
    expect(registry.unregister("test-tool")).toBe(true);
    expect(registry.has("test-tool")).toBe(false);
    expect(registry.size).toBe(0);
  });

  it("should reject manifest with invalid name format", () => {
    const registry = new ToolRegistry();
    const bad = makeManifest({ name: "Invalid Name!" });
    expect(() => registry.register(bad, async () => ({}))).toThrow();
  });
});

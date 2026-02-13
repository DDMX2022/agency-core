import { describe, it, expect } from "vitest";
import { ToolGenerator } from "../core/tools/toolGenerator.js";
import { ToolRegistry } from "../core/tools/toolRegistry.js";
import type { ToolSpec } from "../core/tools/toolManifest.schema.js";

function makeSpec(overrides: Partial<ToolSpec> = {}): ToolSpec {
  return {
    name: "data-fetcher",
    description: "Fetches data from external APIs",
    inputs: { url: "string – the URL to fetch", headers: "object – optional headers" },
    outputs: { data: "unknown – the fetched data", statusCode: "number – HTTP status" },
    permissionLevel: 1,
    requiresApprovalFor: ["production-deploy"],
    tags: ["api", "fetch"],
    ...overrides,
  };
}

describe("ToolGenerator", () => {
  it("should generate a tool with all expected files", () => {
    const registry = new ToolRegistry();
    const generator = new ToolGenerator(registry);
    const result = generator.generate(makeSpec());

    expect(result.manifest.name).toBe("data-fetcher");
    expect(result.manifest.version).toBe("1.0.0");
    expect(result.files).toHaveLength(6);

    const paths = result.files.map((f) => f.path);
    expect(paths).toContain("tools/data-fetcher/data-fetcher.ts");
    expect(paths).toContain("tools/data-fetcher/data-fetcher.test.ts");
    expect(paths).toContain("tools/data-fetcher/tool.json");
    expect(paths).toContain("openclaw-skills/data-fetcher/SKILL.md");
    expect(paths).toContain("openclaw-skills/data-fetcher/tool.json");
    expect(paths).toContain("openclaw-skills/data-fetcher/examples.md");
  });

  it("should auto-register the tool in the registry", () => {
    const registry = new ToolRegistry();
    const generator = new ToolGenerator(registry);
    const result = generator.generate(makeSpec());

    expect(result.registered).toBe(true);
    expect(registry.has("data-fetcher")).toBe(true);
    expect(registry.size).toBe(1);
  });

  it("should not double-register if tool already exists", () => {
    const registry = new ToolRegistry();
    const generator = new ToolGenerator(registry);

    generator.generate(makeSpec());
    const second = generator.generate(makeSpec({ name: "data-fetcher" }));

    expect(second.registered).toBe(false);
    expect(registry.size).toBe(1);
  });

  it("should generate valid SKILL.md content", () => {
    const registry = new ToolRegistry();
    const generator = new ToolGenerator(registry);
    const result = generator.generate(makeSpec());

    const skillFile = result.files.find((f) => f.path.endsWith("SKILL.md"));
    expect(skillFile).toBeDefined();
    expect(skillFile!.content).toContain("DataFetcher Skill");
    expect(skillFile!.content).toContain("Fetches data from external APIs");
    expect(skillFile!.content).toContain("`url`");
    expect(skillFile!.content).toContain("Level 1");
  });

  it("should generate valid tool.json manifest", () => {
    const registry = new ToolRegistry();
    const generator = new ToolGenerator(registry);
    const result = generator.generate(makeSpec());

    const jsonFile = result.files.find(
      (f) => f.path === "tools/data-fetcher/tool.json",
    );
    expect(jsonFile).toBeDefined();

    const parsed = JSON.parse(jsonFile!.content) as Record<string, unknown>;
    expect(parsed["name"]).toBe("data-fetcher");
    expect(parsed["version"]).toBe("1.0.0");
    expect(parsed["entrypoint"]).toBe("./data-fetcher.js");
  });

  it("should generate agent module with class name in PascalCase", () => {
    const registry = new ToolRegistry();
    const generator = new ToolGenerator(registry);
    const result = generator.generate(makeSpec());

    const agentFile = result.files.find(
      (f) => f.path === "tools/data-fetcher/data-fetcher.ts",
    );
    expect(agentFile).toBeDefined();
    expect(agentFile!.content).toContain("class DataFetcher");
    expect(agentFile!.content).toContain("DataFetcherInput");
    expect(agentFile!.content).toContain("DataFetcherOutput");
  });

  it("should convert camelCase names to kebab-case", () => {
    const registry = new ToolRegistry();
    const generator = new ToolGenerator(registry);
    const result = generator.generate(makeSpec({ name: "myAwesomeTool" }));

    expect(result.manifest.name).toBe("my-awesome-tool");
    expect(registry.has("my-awesome-tool")).toBe(true);
  });
});

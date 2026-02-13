import type { ToolSpec } from "../toolManifest.schema.js";

/**
 * Generate the TypeScript agent module source for a tool.
 */
export function agentModuleTemplate(spec: ToolSpec): string {
  const className = toPascalCase(spec.name);
  const inputFields = Object.entries(spec.inputs)
    .map(([k, v]) => `  /** ${v} */\n  ${k}: unknown;`)
    .join("\n");
  const outputFields = Object.entries(spec.outputs)
    .map(([k, v]) => `  /** ${v} */\n  ${k}: unknown;`)
    .join("\n");

  return `import { z } from "zod";
import pino from "pino";

const logger = pino({ name: "${spec.name}" });

// ── Input / Output Schemas ────────────────────────────────────────────
export interface ${className}Input {
${inputFields}
}

export interface ${className}Output {
${outputFields}
}

// ── Agent Class ───────────────────────────────────────────────────────
export class ${className} {
  async run(inputs: ${className}Input): Promise<${className}Output> {
    logger.info({ tool: "${spec.name}" }, "Running ${spec.name}");

    // TODO: Implement tool logic
    throw new Error("${spec.name} not yet implemented");
  }
}
`;
}

/**
 * Generate a Vitest test scaffold for the tool.
 */
export function testTemplate(spec: ToolSpec): string {
  const className = toPascalCase(spec.name);

  return `import { describe, it, expect } from "vitest";
import { ${className} } from "./${spec.name}.js";

describe("${className}", () => {
  it("should be instantiable", () => {
    const tool = new ${className}();
    expect(tool).toBeDefined();
  });

  it("should have a run method", () => {
    const tool = new ${className}();
    expect(typeof tool.run).toBe("function");
  });

  // TODO: Add concrete test cases once logic is implemented
});
`;
}

/**
 * Generate the tool.json manifest file content.
 */
export function manifestJsonTemplate(spec: ToolSpec): string {
  return JSON.stringify(
    {
      name: spec.name,
      version: "1.0.0",
      description: spec.description,
      inputSchema: spec.inputs,
      outputSchema: spec.outputs,
      permissions: {
        level: spec.permissionLevel,
        description: `Requires permission level ${spec.permissionLevel}`,
      },
      requiresApprovalFor: spec.requiresApprovalFor,
      entrypoint: `./${spec.name}.js`,
      tags: spec.tags,
      author: "AgencyCore ToolGenerator",
      createdAt: new Date().toISOString(),
    },
    null,
    2,
  );
}

/**
 * Generate an OpenClaw SKILL.md file for the tool.
 */
export function skillMdTemplate(spec: ToolSpec): string {
  const inputList = Object.entries(spec.inputs)
    .map(([k, v]) => `- **\`${k}\`** – ${v}`)
    .join("\n");
  const outputList = Object.entries(spec.outputs)
    .map(([k, v]) => `- **\`${k}\`** – ${v}`)
    .join("\n");

  return `# ${toPascalCase(spec.name)} Skill

## Description
${spec.description}

## Inputs
${inputList}

## Outputs
${outputList}

## Permission Level
Level ${spec.permissionLevel}${spec.requiresApprovalFor.length > 0 ? `\n\n## Requires Approval For\n${spec.requiresApprovalFor.map((a) => `- ${a}`).join("\n")}` : ""}

## Tags
${spec.tags.map((t) => `\`${t}\``).join(", ") || "None"}

## Usage
\`\`\`json
{
  "tool": "${spec.name}",
  "inputs": {
${Object.keys(spec.inputs)
  .map((k) => `    "${k}": "<value>"`)
  .join(",\n")}
  }
}
\`\`\`
`;
}

/**
 * Generate examples.md for the OpenClaw skill pack.
 */
export function examplesMdTemplate(spec: ToolSpec): string {
  return `# ${toPascalCase(spec.name)} – Examples

## Example 1: Basic Usage

**Input:**
\`\`\`json
{
${Object.keys(spec.inputs)
  .map((k) => `  "${k}": "<example-value>"`)
  .join(",\n")}
}
\`\`\`

**Expected Output:**
\`\`\`json
{
${Object.keys(spec.outputs)
  .map((k) => `  "${k}": "<example-value>"`)
  .join(",\n")}
}
\`\`\`

---

_Add more examples as the tool matures._
`;
}

// ── Helpers ───────────────────────────────────────────────────────────

function toPascalCase(kebab: string): string {
  return kebab
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

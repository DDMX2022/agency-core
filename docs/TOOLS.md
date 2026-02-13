# Tools System

AgencyCore includes a full tool lifecycle: **manifest → registry → generation → OpenClaw skill pack**.

## Tool Manifest

Every tool has a `tool.json` manifest:

```typescript
interface ToolManifest {
  name: string;            // kebab-case unique name
  version: string;         // semver (e.g. "1.0.0")
  description: string;     // What the tool does
  inputSchema: object;     // Input field descriptors
  outputSchema: object;    // Output field descriptors
  permissions: {
    level: 0 | 1 | 2 | 3; // Minimum permission level
    description: string;
  };
  requiresApprovalFor: string[];  // Actions needing sign-off
  entrypoint: string;      // Relative path to module
  tags: string[];           // Discovery tags
  author: string;
  createdAt: string;        // ISO 8601
}
```

## Tool Registry

In-memory catalog with permission-gated execution:

```typescript
const registry = new ToolRegistry();

// Register
registry.register(manifest, async (inputs) => {
  return { result: process(inputs) };
});

// List
const tools = registry.list(); // ToolManifest[]

// Execute (with permission check)
const output = await registry.execute("my-tool", { query: "hello" }, callerLevel);

// Unregister
registry.unregister("my-tool");
```

### Permission Levels

| Level | Access |
|-------|--------|
| 0 | Read-only tools, no side effects |
| 1 | File creation, safe commands |
| 2 | File modification, network access |
| 3 | Destructive operations, deployment |

## Tool Generator

The `ToolGenerator` takes a **ToolSpec** and produces a full tool:

```typescript
const generator = new ToolGenerator(registry);

const result = generator.generate({
  name: "data-fetcher",
  description: "Fetches data from external APIs",
  inputs: { url: "string", headers: "object" },
  outputs: { data: "unknown", statusCode: "number" },
  permissionLevel: 1,
  requiresApprovalFor: ["production-deploy"],
  tags: ["api", "fetch"],
});
```

### Generated Files

```
tools/data-fetcher/
  data-fetcher.ts          – Agent module (class + I/O interfaces)
  data-fetcher.test.ts     – Vitest test scaffold
  tool.json                – Manifest

openclaw-skills/data-fetcher/
  SKILL.md                 – Human-readable skill description
  tool.json                – Manifest (copy)
  examples.md              – Usage examples
```

### Auto-Registration

The generator automatically registers the tool in the registry with a stub handler. Replace the stub with real logic in the generated `.ts` file.

## OpenClaw Skill Packs

Each generated tool produces a skill pack in `openclaw-skills/<name>/` containing:

- **SKILL.md** – Description, inputs, outputs, permissions, usage example
- **tool.json** – Machine-readable manifest
- **examples.md** – Example input/output pairs

These packs can be consumed by OpenClaw or any compatible agent orchestrator.

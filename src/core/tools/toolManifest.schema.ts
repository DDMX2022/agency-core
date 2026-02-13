import { z } from "zod";

// ── Permission descriptor ─────────────────────────────────────────────
export const ToolPermissionSchema = z.object({
  level: z.number().int().min(0).max(3),
  description: z.string().min(1),
});
export type ToolPermission = z.infer<typeof ToolPermissionSchema>;

// ── Tool Manifest ─────────────────────────────────────────────────────
export const ToolManifestSchema = z.object({
  /** Unique tool name, kebab-case */
  name: z.string().min(1).regex(/^[a-z0-9-]+$/, "Tool name must be kebab-case"),
  /** Semantic version */
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Must be semver (e.g. 1.0.0)"),
  /** Human-readable description */
  description: z.string().min(1),
  /** JSON Schema (as Zod-like descriptor) for inputs */
  inputSchema: z.record(z.unknown()),
  /** JSON Schema (as Zod-like descriptor) for outputs */
  outputSchema: z.record(z.unknown()),
  /** Minimum permission level to use this tool */
  permissions: ToolPermissionSchema,
  /** Actions that always require human approval */
  requiresApprovalFor: z.array(z.string()).default([]),
  /** Entry point path relative to tools directory */
  entrypoint: z.string().min(1),
  /** Tags for discovery */
  tags: z.array(z.string()).default([]),
  /** Author or generating agent */
  author: z.string().default("AgencyCore"),
  /** ISO timestamp of creation */
  createdAt: z.string().datetime(),
});
export type ToolManifest = z.infer<typeof ToolManifestSchema>;

// ── Tool Spec (input to Tool Generator) ───────────────────────────────
export const ToolSpecSchema = z.object({
  /** Desired tool name */
  name: z.string().min(1),
  /** What the tool does */
  description: z.string().min(1),
  /** Input fields: name → type description */
  inputs: z.record(z.string()),
  /** Output fields: name → type description */
  outputs: z.record(z.string()),
  /** Minimum permission level */
  permissionLevel: z.number().int().min(0).max(3).default(0),
  /** Actions needing approval */
  requiresApprovalFor: z.array(z.string()).default([]),
  /** Tags for categorization */
  tags: z.array(z.string()).default([]),
});
export type ToolSpec = z.infer<typeof ToolSpecSchema>;

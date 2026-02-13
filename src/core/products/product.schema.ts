import { z } from "zod";

// ── Project Template Types ────────────────────────────────────────────
export const ProjectTemplateSchema = z.enum(["node-ts", "nextjs"]);
export type ProjectTemplate = z.infer<typeof ProjectTemplateSchema>;

// ── Scaffold Request ──────────────────────────────────────────────────
export const ScaffoldRequestSchema = z.object({
  /** Project name (kebab-case) */
  name: z.string().min(1).regex(/^[a-z0-9-]+$/, "Project name must be kebab-case"),
  /** Template to use */
  template: ProjectTemplateSchema,
  /** Short description */
  description: z.string().min(1),
  /** Features to include */
  features: z.array(z.string()).default([]),
  /** Whether to include test scaffolding */
  includeTests: z.boolean().default(true),
  /** Whether to generate a git plan (requires approval) */
  gitPlan: z.boolean().default(false),
});
export type ScaffoldRequest = z.infer<typeof ScaffoldRequestSchema>;

// ── Scaffold Result ───────────────────────────────────────────────────
export const ScaffoldFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});
export type ScaffoldFile = z.infer<typeof ScaffoldFileSchema>;

export const GitPlanStepSchema = z.object({
  step: z.number().int().positive(),
  action: z.enum(["init", "add", "commit", "branch", "push"]),
  description: z.string().min(1),
  command: z.string().min(1),
  requiresApproval: z.boolean(),
});
export type GitPlanStep = z.infer<typeof GitPlanStepSchema>;

export const ScaffoldResultSchema = z.object({
  projectName: z.string().min(1),
  template: ProjectTemplateSchema,
  files: z.array(ScaffoldFileSchema),
  gitPlan: z.array(GitPlanStepSchema).optional(),
  requiresApproval: z.boolean(),
  timestamp: z.string().datetime(),
});
export type ScaffoldResult = z.infer<typeof ScaffoldResultSchema>;

import pino from "pino";
import {
  ScaffoldRequestSchema,
  type ScaffoldRequest,
  type ScaffoldResult,
} from "./product.schema.js";
import { nodeTypeScriptTemplate } from "./templates/nodeTypescript.js";
import { nextjsTemplate } from "./templates/nextjs.js";

const logger = pino({ name: "product-scaffolder" });

/**
 * ProductScaffolder – generates complete project folder structures.
 *
 * Supports:
 *   • node-ts  – Node.js + TypeScript project
 *   • nextjs   – Next.js 15 App Router project
 *
 * Optionally generates a Git Plan (with requiresApproval=true for push).
 * Does NOT write to disk – returns file descriptors for the caller to handle.
 */
export class ProductScaffolder {
  /**
   * Scaffold a new project from a request.
   */
  scaffold(request: ScaffoldRequest): ScaffoldResult {
    // Validate the request
    const validated = ScaffoldRequestSchema.parse(request);

    logger.info(
      { project: validated.name, template: validated.template },
      "Scaffolding project",
    );

    let files;
    let gitPlan;

    switch (validated.template) {
      case "node-ts": {
        const result = nodeTypeScriptTemplate(validated);
        files = result.files;
        gitPlan = result.gitPlan;
        break;
      }
      case "nextjs": {
        const result = nextjsTemplate(validated);
        files = result.files;
        gitPlan = result.gitPlan;
        break;
      }
      default: {
        throw new Error(`Unknown template: ${validated.template as string}`);
      }
    }

    // Any git push step means approval is required
    const requiresApproval =
      validated.gitPlan && gitPlan.some((step) => step.requiresApproval);

    const scaffoldResult: ScaffoldResult = {
      projectName: validated.name,
      template: validated.template,
      files,
      gitPlan: gitPlan.length > 0 ? gitPlan : undefined,
      requiresApproval: requiresApproval ?? false,
      timestamp: new Date().toISOString(),
    };

    logger.info(
      {
        project: validated.name,
        fileCount: files.length,
        hasGitPlan: gitPlan.length > 0,
        requiresApproval,
      },
      "Scaffold complete",
    );

    return scaffoldResult;
  }
}

import type { ScaffoldRequest, ScaffoldFile, GitPlanStep } from "../product.schema.js";

/**
 * Generate a Node.js + TypeScript project scaffold.
 */
export function nodeTypeScriptTemplate(req: ScaffoldRequest): {
  files: ScaffoldFile[];
  gitPlan: GitPlanStep[];
} {
  const files: ScaffoldFile[] = [
    {
      path: `${req.name}/package.json`,
      content: JSON.stringify(
        {
          name: req.name,
          version: "0.1.0",
          description: req.description,
          type: "module",
          engines: { node: ">=20.0.0" },
          scripts: {
            build: "tsc",
            dev: "tsx watch src/index.ts",
            start: "node dist/index.js",
            test: "vitest run",
            "test:watch": "vitest",
          },
          dependencies: {},
          devDependencies: {
            typescript: "^5.7.0",
            tsx: "^4.19.0",
            "@types/node": "^22.0.0",
            vitest: "^3.0.0",
          },
        },
        null,
        2,
      ),
    },
    {
      path: `${req.name}/tsconfig.json`,
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            lib: ["ES2022"],
            outDir: "./dist",
            rootDir: "./src",
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            forceConsistentCasingInFileNames: true,
            resolveJsonModule: true,
            declaration: true,
            sourceMap: true,
            isolatedModules: true,
            verbatimModuleSyntax: true,
          },
          include: ["src/**/*.ts"],
          exclude: ["node_modules", "dist", "**/*.test.ts"],
        },
        null,
        2,
      ),
    },
    {
      path: `${req.name}/src/index.ts`,
      content: `/**\n * ${req.description}\n */\n\nconsole.log("Hello from ${req.name}!");\n`,
    },
    {
      path: `${req.name}/README.md`,
      content: `# ${req.name}\n\n${req.description}\n\n## Getting Started\n\n\`\`\`bash\npnpm install\npnpm dev\n\`\`\`\n\n## Build\n\n\`\`\`bash\npnpm build\n\`\`\`\n\n## Test\n\n\`\`\`bash\npnpm test\n\`\`\`\n`,
    },
    {
      path: `${req.name}/ARCHITECTURE.md`,
      content: `# ${req.name} – Architecture\n\n## Overview\n${req.description}\n\n## Structure\n\`\`\`\nsrc/\n  index.ts      – Entry point\n  lib/          – Core library modules\ntests/          – Test files\n\`\`\`\n\n## Features\n${req.features.map((f) => `- ${f}`).join("\n") || "- Core functionality"}\n`,
    },
    {
      path: `${req.name}/.gitignore`,
      content: `node_modules/\ndist/\n*.log\n.env\n`,
    },
  ];

  if (req.includeTests) {
    files.push({
      path: `${req.name}/src/__tests__/index.test.ts`,
      content: `import { describe, it, expect } from "vitest";\n\ndescribe("${req.name}", () => {\n  it("should be set up correctly", () => {\n    expect(true).toBe(true);\n  });\n});\n`,
    });
  }

  const gitPlan: GitPlanStep[] = req.gitPlan
    ? [
        {
          step: 1,
          action: "init",
          description: "Initialize git repository",
          command: `cd ${req.name} && git init`,
          requiresApproval: false,
        },
        {
          step: 2,
          action: "add",
          description: "Stage all generated files",
          command: `cd ${req.name} && git add .`,
          requiresApproval: false,
        },
        {
          step: 3,
          action: "commit",
          description: "Initial commit with scaffolded project",
          command: `cd ${req.name} && git commit -m "feat: initial scaffold from AgencyCore"`,
          requiresApproval: false,
        },
        {
          step: 4,
          action: "branch",
          description: "Create main branch",
          command: `cd ${req.name} && git branch -M main`,
          requiresApproval: false,
        },
        {
          step: 5,
          action: "push",
          description: "Push to remote (requires approval)",
          command: `cd ${req.name} && git remote add origin <remote-url> && git push -u origin main`,
          requiresApproval: true,
        },
      ]
    : [];

  return { files, gitPlan };
}

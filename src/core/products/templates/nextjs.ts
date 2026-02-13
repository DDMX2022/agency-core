import type { ScaffoldRequest, ScaffoldFile, GitPlanStep } from "../product.schema.js";

/**
 * Generate a Next.js project scaffold.
 */
export function nextjsTemplate(req: ScaffoldRequest): {
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
          private: true,
          scripts: {
            dev: "next dev",
            build: "next build",
            start: "next start",
            lint: "next lint",
            test: "vitest run",
          },
          dependencies: {
            next: "^15.0.0",
            react: "^19.0.0",
            "react-dom": "^19.0.0",
          },
          devDependencies: {
            typescript: "^5.7.0",
            "@types/node": "^22.0.0",
            "@types/react": "^19.0.0",
            "@types/react-dom": "^19.0.0",
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
            target: "ES2017",
            lib: ["dom", "dom.iterable", "ES2017"],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: "esnext",
            moduleResolution: "bundler",
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: "preserve",
            incremental: true,
            plugins: [{ name: "next" }],
            paths: { "@/*": ["./src/*"] },
          },
          include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
          exclude: ["node_modules"],
        },
        null,
        2,
      ),
    },
    {
      path: `${req.name}/next.config.ts`,
      content: `import type { NextConfig } from "next";\n\nconst nextConfig: NextConfig = {};\n\nexport default nextConfig;\n`,
    },
    {
      path: `${req.name}/src/app/layout.tsx`,
      content: `import type { Metadata } from "next";\n\nexport const metadata: Metadata = {\n  title: "${req.name}",\n  description: "${req.description}",\n};\n\nexport default function RootLayout({\n  children,\n}: {\n  children: React.ReactNode;\n}) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n`,
    },
    {
      path: `${req.name}/src/app/page.tsx`,
      content: `export default function Home() {\n  return (\n    <main>\n      <h1>${req.name}</h1>\n      <p>${req.description}</p>\n    </main>\n  );\n}\n`,
    },
    {
      path: `${req.name}/README.md`,
      content: `# ${req.name}\n\n${req.description}\n\n## Getting Started\n\n\`\`\`bash\npnpm install\npnpm dev\n\`\`\`\n\nOpen [http://localhost:3000](http://localhost:3000) to see the app.\n\n## Build\n\n\`\`\`bash\npnpm build\npnpm start\n\`\`\`\n`,
    },
    {
      path: `${req.name}/ARCHITECTURE.md`,
      content: `# ${req.name} – Architecture\n\n## Overview\n${req.description}\n\n## Stack\n- **Framework**: Next.js 15 (App Router)\n- **Language**: TypeScript\n- **Styling**: TBD\n\n## Structure\n\`\`\`\nsrc/\n  app/\n    layout.tsx   – Root layout\n    page.tsx     – Home page\n  lib/           – Utilities\n  components/    – React components\n\`\`\`\n\n## Features\n${req.features.map((f) => `- ${f}`).join("\n") || "- Core functionality"}\n`,
    },
    {
      path: `${req.name}/.gitignore`,
      content: `node_modules/\n.next/\nout/\n*.log\n.env*.local\n`,
    },
  ];

  if (req.includeTests) {
    files.push({
      path: `${req.name}/src/__tests__/page.test.tsx`,
      content: `import { describe, it, expect } from "vitest";\n\ndescribe("${req.name} Home", () => {\n  it("should be set up correctly", () => {\n    expect(true).toBe(true);\n  });\n});\n`,
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
          description: "Initial commit with scaffolded Next.js project",
          command: `cd ${req.name} && git commit -m "feat: initial Next.js scaffold from AgencyCore"`,
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

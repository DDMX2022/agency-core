# Product Scaffolder

AgencyCore can generate complete project structures from templates, ready for development.

## Supported Templates

| Template | Description |
|----------|-------------|
| `node-ts` | Node.js + TypeScript project with ESM, Vitest, tsx |
| `nextjs` | Next.js 15 App Router with TypeScript |

## API

### `POST /products/scaffold`

**Request Body:**
```json
{
  "name": "my-saas-app",
  "template": "node-ts",
  "description": "A SaaS billing microservice",
  "features": ["auth", "billing", "webhooks"],
  "includeTests": true,
  "gitPlan": true
}
```

**Response (200):**
```json
{
  "projectName": "my-saas-app",
  "template": "node-ts",
  "files": [
    { "path": "my-saas-app/package.json", "content": "..." },
    { "path": "my-saas-app/tsconfig.json", "content": "..." },
    { "path": "my-saas-app/src/index.ts", "content": "..." },
    { "path": "my-saas-app/README.md", "content": "..." },
    { "path": "my-saas-app/ARCHITECTURE.md", "content": "..." },
    { "path": "my-saas-app/.gitignore", "content": "..." },
    { "path": "my-saas-app/src/__tests__/index.test.ts", "content": "..." }
  ],
  "gitPlan": [
    { "step": 1, "action": "init", "command": "cd my-saas-app && git init", "requiresApproval": false },
    { "step": 2, "action": "add", "command": "cd my-saas-app && git add .", "requiresApproval": false },
    { "step": 3, "action": "commit", "command": "cd my-saas-app && git commit -m \"feat: initial scaffold\"", "requiresApproval": false },
    { "step": 4, "action": "branch", "command": "cd my-saas-app && git branch -M main", "requiresApproval": false },
    { "step": 5, "action": "push", "command": "cd my-saas-app && git push -u origin main", "requiresApproval": true }
  ],
  "requiresApproval": true,
  "timestamp": "2025-01-15T10:00:00.000Z"
}
```

## Generated Structure

### Node.js + TypeScript (`node-ts`)

```
my-app/
  package.json         – ESM, Node 20+, pnpm scripts
  tsconfig.json        – Strict, ES2022, bundler resolution
  src/
    index.ts           – Entry point
    __tests__/
      index.test.ts    – Vitest scaffold
  README.md            – Getting started guide
  ARCHITECTURE.md      – Architecture overview + features
  .gitignore
```

### Next.js (`nextjs`)

```
my-app/
  package.json         – Next.js 15, React 19
  tsconfig.json        – Next.js paths, JSX preserve
  next.config.ts
  src/
    app/
      layout.tsx       – Root layout with metadata
      page.tsx         – Home page
    __tests__/
      page.test.tsx    – Vitest scaffold
  README.md
  ARCHITECTURE.md
  .gitignore
```

## Git Plan

When `gitPlan: true`, the scaffolder generates a step-by-step git workflow. The `push` step always has `requiresApproval: true` to prevent accidental pushes to remote repositories.

## Programmatic Usage

```typescript
import { ProductScaffolder } from "./core/products/productScaffolder.js";

const scaffolder = new ProductScaffolder();
const result = scaffolder.scaffold({
  name: "my-api",
  template: "node-ts",
  description: "REST API for user management",
  features: ["auth", "database"],
  includeTests: true,
  gitPlan: false,
});

// result.files contains all file descriptors
// Write them to disk as needed
```

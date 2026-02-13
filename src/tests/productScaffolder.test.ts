import { describe, it, expect } from "vitest";
import { ProductScaffolder } from "../core/products/productScaffolder.js";
import type { ScaffoldRequest } from "../core/products/product.schema.js";

function makeRequest(overrides: Partial<ScaffoldRequest> = {}): ScaffoldRequest {
  return {
    name: "my-app",
    template: "node-ts",
    description: "A test application",
    features: ["auth", "api"],
    includeTests: true,
    gitPlan: false,
    ...overrides,
  };
}

describe("ProductScaffolder", () => {
  const scaffolder = new ProductScaffolder();

  // ── Node.js / TypeScript Template ─────────────────────────────────

  it("should scaffold a node-ts project with expected files", () => {
    const result = scaffolder.scaffold(makeRequest());

    expect(result.projectName).toBe("my-app");
    expect(result.template).toBe("node-ts");
    expect(result.files.length).toBeGreaterThanOrEqual(6);

    const paths = result.files.map((f) => f.path);
    expect(paths).toContain("my-app/package.json");
    expect(paths).toContain("my-app/tsconfig.json");
    expect(paths).toContain("my-app/src/index.ts");
    expect(paths).toContain("my-app/README.md");
    expect(paths).toContain("my-app/ARCHITECTURE.md");
    expect(paths).toContain("my-app/.gitignore");
  });

  it("should include test scaffold when includeTests is true", () => {
    const result = scaffolder.scaffold(makeRequest({ includeTests: true }));
    const testFile = result.files.find((f) => f.path.includes("__tests__"));
    expect(testFile).toBeDefined();
  });

  it("should not include test scaffold when includeTests is false", () => {
    const result = scaffolder.scaffold(makeRequest({ includeTests: false }));
    const testFile = result.files.find((f) => f.path.includes("__tests__"));
    expect(testFile).toBeUndefined();
  });

  it("should generate git plan when gitPlan is true", () => {
    const result = scaffolder.scaffold(makeRequest({ gitPlan: true }));
    expect(result.gitPlan).toBeDefined();
    expect(result.gitPlan!.length).toBeGreaterThan(0);
    expect(result.requiresApproval).toBe(true);
  });

  it("should not generate git plan when gitPlan is false", () => {
    const result = scaffolder.scaffold(makeRequest({ gitPlan: false }));
    expect(result.gitPlan).toBeUndefined();
    expect(result.requiresApproval).toBe(false);
  });

  it("should have requiresApproval on push step", () => {
    const result = scaffolder.scaffold(makeRequest({ gitPlan: true }));
    const pushStep = result.gitPlan!.find((s) => s.action === "push");
    expect(pushStep).toBeDefined();
    expect(pushStep!.requiresApproval).toBe(true);
  });

  it("should produce valid package.json", () => {
    const result = scaffolder.scaffold(makeRequest());
    const pkgFile = result.files.find((f) => f.path.endsWith("package.json"));
    expect(pkgFile).toBeDefined();

    const pkg = JSON.parse(pkgFile!.content) as Record<string, unknown>;
    expect(pkg["name"]).toBe("my-app");
    expect(pkg["type"]).toBe("module");
  });

  // ── Next.js Template ──────────────────────────────────────────────

  it("should scaffold a nextjs project with expected files", () => {
    const result = scaffolder.scaffold(
      makeRequest({ name: "next-app", template: "nextjs" }),
    );

    expect(result.template).toBe("nextjs");
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain("next-app/package.json");
    expect(paths).toContain("next-app/tsconfig.json");
    expect(paths).toContain("next-app/next.config.ts");
    expect(paths).toContain("next-app/src/app/layout.tsx");
    expect(paths).toContain("next-app/src/app/page.tsx");
    expect(paths).toContain("next-app/README.md");
  });

  it("should include Next.js dependencies in package.json", () => {
    const result = scaffolder.scaffold(
      makeRequest({ name: "next-app", template: "nextjs" }),
    );
    const pkgFile = result.files.find((f) => f.path.endsWith("package.json"));
    const pkg = JSON.parse(pkgFile!.content) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies["next"]).toBeDefined();
    expect(pkg.dependencies["react"]).toBeDefined();
  });

  // ── Validation ────────────────────────────────────────────────────

  it("should reject project name with invalid characters", () => {
    expect(() =>
      scaffolder.scaffold(makeRequest({ name: "My Bad Name!" })),
    ).toThrow();
  });

  it("should include features in ARCHITECTURE.md", () => {
    const result = scaffolder.scaffold(
      makeRequest({ features: ["auth", "database", "cache"] }),
    );
    const archFile = result.files.find((f) => f.path.endsWith("ARCHITECTURE.md"));
    expect(archFile).toBeDefined();
    expect(archFile!.content).toContain("- auth");
    expect(archFile!.content).toContain("- database");
    expect(archFile!.content).toContain("- cache");
  });

  it("should have a valid timestamp", () => {
    const result = scaffolder.scaffold(makeRequest());
    expect(() => new Date(result.timestamp)).not.toThrow();
    expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0);
  });
});

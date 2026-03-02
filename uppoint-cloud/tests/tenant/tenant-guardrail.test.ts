import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

function collectFilesRecursively(rootDir: string): string[] {
  const entries = readdirSync(rootDir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...collectFilesRecursively(fullPath));
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

describe("tenant authorization guardrail", () => {
  it("requires explicit tenant authorization in tenant-scoped app entry points", () => {
    const appDir = path.join(process.cwd(), "app");
    const entryFiles = collectFilesRecursively(appDir).filter((filePath) =>
      /(?:route\.ts|page\.tsx|actions\.ts)$/.test(filePath),
    );

    const violations: string[] = [];

    for (const filePath of entryFiles) {
      const source = readFileSync(filePath, "utf8");
      const referencesTenantScope =
        /\btenantId\b/.test(source)
        || /\btenantMembership\b/.test(source)
        || /\bTenantMembership\b/.test(source);

      if (!referencesTenantScope) {
        continue;
      }

      const hasServerTenantAuth =
        /assertTenantAccess\(/.test(source)
        || /resolveUserTenantContext\(/.test(source);

      if (!hasServerTenantAuth) {
        violations.push(path.relative(process.cwd(), filePath));
      }
    }

    expect(violations).toEqual([]);
  });

  it("requires explicit tenant authorization in tenant-aware server module entry points", () => {
    const modulesDir = path.join(process.cwd(), "modules");
    const entryFiles = collectFilesRecursively(modulesDir).filter((filePath) =>
      /\/server\/.+\.ts$/.test(filePath),
    );

    const violations: string[] = [];

    for (const filePath of entryFiles) {
      const source = readFileSync(filePath, "utf8");
      const hasTenantInput = /\btenantId\??\s*:\s*string\b/.test(source);

      if (!hasTenantInput) {
        continue;
      }

      const hasServerTenantAuth =
        /assertTenantAccess\(/.test(source)
        || /resolveUserTenantContext\(/.test(source)
        || /export\s+async\s+function\s+assertTenantAccess\(/.test(source)
        || /export\s+async\s+function\s+resolveUserTenantContext\(/.test(source);

      if (!hasServerTenantAuth) {
        violations.push(path.relative(process.cwd(), filePath));
      }
    }

    expect(violations).toEqual([]);
  });
});

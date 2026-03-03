import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const APPROVED_DIRECT_TENANT_QUERY_FILES = new Set([
  "db/repositories/tenant-repository.ts",
  "modules/auth/server/register-verification-challenge.ts",
]);

const TENANT_INPUT_GUARD_EXEMPT_FILES = new Set([
  // Carries tenant/user context for forensic metadata only; no tenant-scoped reads/mutations.
  "modules/notifications/server/outbox.ts",
]);

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
      const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
      if (TENANT_INPUT_GUARD_EXEMPT_FILES.has(relativePath)) {
        continue;
      }

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
        violations.push(relativePath);
      }
    }

    expect(violations).toEqual([]);
  });

  it("blocks direct tenant membership queries in app entry points without tenant scope guards", () => {
    const appDir = path.join(process.cwd(), "app");
    const entryFiles = collectFilesRecursively(appDir).filter((filePath) =>
      /(?:route\.ts|page\.tsx|actions\.ts)$/.test(filePath),
    );

    const violations: string[] = [];

    for (const filePath of entryFiles) {
      const source = readFileSync(filePath, "utf8");
      const hasDirectTenantQuery =
        /prisma\.tenantMembership\./.test(source)
        || /prisma\.tenant\./.test(source);

      if (!hasDirectTenantQuery) {
        continue;
      }

      const hasTenantGuard =
        /assertTenantAccess\(/.test(source)
        || /resolveUserTenantContext\(/.test(source);

      if (!hasTenantGuard) {
        violations.push(path.relative(process.cwd(), filePath));
      }
    }

    expect(violations).toEqual([]);
  });

  it("blocks unreviewed direct tenant model queries in app/modules server code", () => {
    const candidateRoots = [
      path.join(process.cwd(), "app"),
      path.join(process.cwd(), "modules"),
      path.join(process.cwd(), "db"),
      path.join(process.cwd(), "lib"),
    ];
    const files = candidateRoots.flatMap((root) => collectFilesRecursively(root));
    const candidateFiles = files.filter((filePath) => /\.(ts|tsx)$/.test(filePath));
    const violations: string[] = [];

    for (const filePath of candidateFiles) {
      const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
      const source = readFileSync(filePath, "utf8");
      const hasDirectTenantQuery =
        /\b(?:prisma|tx)\s*\.\s*tenantMembership\s*\./.test(source)
        || /\b(?:prisma|tx)\s*\.\s*tenant\s*\./.test(source)
        || /"(?:TenantMembership|Tenant)"\s+(?:WHERE|SET|VALUES|JOIN|FROM|INSERT|UPDATE|DELETE)/i.test(source);

      if (!hasDirectTenantQuery) {
        continue;
      }

      if (APPROVED_DIRECT_TENANT_QUERY_FILES.has(relativePath)) {
        continue;
      }

      const hasGuardCall =
        /assertTenantAccess\(/.test(source)
        || /resolveUserTenantContext\(/.test(source);

      if (!hasGuardCall) {
        violations.push(relativePath);
      }
    }

    expect(violations).toEqual([]);
  });
});

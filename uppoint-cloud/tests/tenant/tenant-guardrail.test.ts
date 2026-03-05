import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const APPROVED_DIRECT_TENANT_QUERY_FILES = new Set([
  "db/repositories/tenant-repository.ts",
]);

const TENANT_INPUT_GUARD_EXEMPT_FILES = new Set([
  // Carries tenant/user context for forensic metadata only; no tenant-scoped reads/mutations.
  "modules/notifications/server/outbox.ts",
]);

const APPROVED_TENANT_SCOPED_MODEL_FILES = new Set([
  "lib/audit-log.ts",
  "modules/notifications/server/outbox.ts",
]);

const APPROVED_SCRIPT_TENANT_QUERY_FILES = new Set<string>([
  // Cleanup script checks TenantMembership relation to avoid deleting real tenant-linked users.
  "scripts/cleanup-db.sh",
]);
const TENANT_SCOPED_PRISMA_PROPERTIES = new Set([
  "tenant",
  "tenantMembership",
  "auditLog",
  "notificationOutbox",
]);
const TENANT_ONLY_PRISMA_PROPERTIES = new Set([
  "tenant",
  "tenantMembership",
]);
const AUDIT_NOTIFICATION_PRISMA_PROPERTIES = new Set([
  "auditLog",
  "notificationOutbox",
]);

function isPrismaRoot(node: ts.Node): boolean {
  return ts.isIdentifier(node) && (node.text === "prisma" || node.text === "tx");
}

function normalizePrismaPropertyName(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9]/g, "");
}

function hasDirectTenantPrismaAccess(
  source: string,
  allowedProperties: ReadonlySet<string> = TENANT_SCOPED_PRISMA_PROPERTIES,
): boolean {
  const sourceFile = ts.createSourceFile("guardrail.ts", source, ts.ScriptTarget.Latest, true);
  let found = false;

  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }

    if (ts.isPropertyAccessExpression(node)) {
      if (isPrismaRoot(node.expression)) {
        const property = normalizePrismaPropertyName(node.name.text);
        if (allowedProperties.has(property)) {
          found = true;
          return;
        }
      }
    }

    if (ts.isElementAccessExpression(node)) {
      if (isPrismaRoot(node.expression) && node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression)) {
        const property = normalizePrismaPropertyName(node.argumentExpression.text);
        if (allowedProperties.has(property)) {
          found = true;
          return;
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

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
        hasDirectTenantPrismaAccess(source, TENANT_ONLY_PRISMA_PROPERTIES);

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
        hasDirectTenantPrismaAccess(source, TENANT_ONLY_PRISMA_PROPERTIES)
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

  it("blocks unreviewed direct access to tenant-scoped tables in app/modules/db/lib layers", () => {
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
      const hasDirectScopedQuery =
        hasDirectTenantPrismaAccess(source, AUDIT_NOTIFICATION_PRISMA_PROPERTIES)
        || /"(?:AuditLog|NotificationOutbox)"\s+(?:WHERE|SET|VALUES|JOIN|FROM|INSERT|UPDATE|DELETE)/i.test(source);

      if (!hasDirectScopedQuery) {
        continue;
      }

      if (!APPROVED_TENANT_SCOPED_MODEL_FILES.has(relativePath)) {
        violations.push(relativePath);
      }
    }

    expect(violations).toEqual([]);
  });

  it("blocks direct tenant table queries in scripts unless explicitly approved", () => {
    const scriptsDir = path.join(process.cwd(), "scripts");
    const scriptFiles = collectFilesRecursively(scriptsDir).filter((filePath) =>
      /\.(?:sh|bash|mjs|js|ts|sql)$/.test(filePath),
    );
    const violations: string[] = [];

    for (const filePath of scriptFiles) {
      const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
      const source = readFileSync(filePath, "utf8");
      const touchesTenantTables =
        /"(?:Tenant|TenantMembership)"\s+(?:WHERE|SET|VALUES|JOIN|FROM|INSERT|UPDATE|DELETE)/i.test(source)
        || /\btenantMembership\b/i.test(source)
        || /\btenantId_userId\b/i.test(source);

      if (!touchesTenantTables) {
        continue;
      }

      if (!APPROVED_SCRIPT_TENANT_QUERY_FILES.has(relativePath)) {
        violations.push(relativePath);
      }
    }

    expect(violations).toEqual([]);
  });
});

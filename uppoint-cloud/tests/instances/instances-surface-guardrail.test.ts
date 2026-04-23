import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const INSTANCE_ENTRYPOINT_GUARD_EXEMPT_FILES = new Set([
  // Internal worker protocol uses token+signature+replay guard and does not rely on user session tenant context.
  "app/api/internal/instances/provisioning/claim/route.ts",
  "app/api/internal/instances/provisioning/report/route.ts",
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

describe("instances module guardrails", () => {
  it("requires explicit instance tenant authorization for future app entry points", () => {
    const appDir = path.join(process.cwd(), "app");
    const candidateFiles = collectFilesRecursively(appDir).filter((filePath) => {
      const normalized = filePath.replace(/\\/g, "/");
      return normalized.includes("/instances/")
        && /(?:route\.ts|page\.tsx|actions\.ts)$/.test(normalized);
    });

    const violations: string[] = [];

    for (const filePath of candidateFiles) {
      const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
      if (INSTANCE_ENTRYPOINT_GUARD_EXEMPT_FILES.has(relativePath)) {
        continue;
      }

      const source = readFileSync(filePath, "utf8");
      const hasServerGuard =
        /assertInstanceTenantAccess\(/.test(source)
        || /assertTenantAccess\(/.test(source)
        || /resolveUserTenantContext\(/.test(source);

      if (!hasServerGuard) {
        violations.push(relativePath);
      }
    }

    expect(violations).toEqual([]);
  });

  it("blocks direct hypervisor/process coupling inside instances server boundary", () => {
    const instancesServerDir = path.join(process.cwd(), "modules", "instances", "server");
    const candidateFiles = collectFilesRecursively(instancesServerDir).filter((filePath) =>
      /\.(ts|tsx)$/.test(filePath),
    );
    const violations: string[] = [];

    for (const filePath of candidateFiles) {
      const source = readFileSync(filePath, "utf8");
      const hasForbiddenCoupling =
        /from\s+["']node:child_process["']/.test(source)
        || /from\s+["']child_process["']/.test(source)
        || /libvirt/i.test(source)
        || /qemu/i.test(source)
        || /virsh/i.test(source);

      if (hasForbiddenCoupling) {
        violations.push(path.relative(process.cwd(), filePath).replace(/\\/g, "/"));
      }
    }

    expect(violations).toEqual([]);
  });
});

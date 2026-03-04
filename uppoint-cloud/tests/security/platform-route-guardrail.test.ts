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

describe("platform route guardrail", () => {
  it("requires explicit platform access guard for admin/support routes", () => {
    const appDir = path.join(process.cwd(), "app");
    const entryFiles = collectFilesRecursively(appDir).filter((filePath) =>
      /(?:route\.ts|page\.tsx|actions\.ts)$/.test(filePath),
    );
    const violations: string[] = [];

    for (const filePath of entryFiles) {
      const normalized = filePath.replace(/\\/g, "/");
      if (!/\/(?:admin|support)(?:\/|$)/.test(normalized)) {
        continue;
      }

      const source = readFileSync(filePath, "utf8");
      const hasPlatformGuard = /assertPlatformAccess\(/.test(source);

      if (!hasPlatformGuard) {
        violations.push(path.relative(process.cwd(), filePath).replace(/\\/g, "/"));
      }
    }

    expect(violations).toEqual([]);
  });
});

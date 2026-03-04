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

describe("auth repository boundary guardrail", () => {
  it("blocks direct prisma access inside auth server module", () => {
    const authServerDir = path.join(process.cwd(), "modules", "auth", "server");
    const candidateFiles = collectFilesRecursively(authServerDir).filter((filePath) => filePath.endsWith(".ts"));

    const violations: string[] = [];

    for (const filePath of candidateFiles) {
      const source = readFileSync(filePath, "utf8");
      if (/\bprisma\s*\./.test(source)) {
        violations.push(path.relative(process.cwd(), filePath).replace(/\\/g, "/"));
      }
    }

    expect(violations).toEqual([]);
  });
});

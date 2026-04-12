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

describe("server error logging guardrail", () => {
  it("blocks raw server-side error object logging in auth/internal routes and infra paths", () => {
    const appApiRoot = path.join(process.cwd(), "app", "api");
    const routeFiles = collectFilesRecursively(appApiRoot).filter((filePath) => filePath.endsWith("route.ts"));
    const infraFiles = [
      path.join(process.cwd(), "lib", "audit-log.ts"),
      path.join(process.cwd(), "lib", "rate-limit.ts"),
      path.join(process.cwd(), "lib", "http", "idempotency.ts"),
      path.join(process.cwd(), "modules", "notifications", "server", "outbox.ts"),
    ];

    const candidateFiles = [...routeFiles, ...infraFiles];
    const rawErrorLoggingPattern = /\bconsole\.error\([^;\n]*,\s*error\s*\)/;

    const violations = candidateFiles
      .filter((filePath) => rawErrorLoggingPattern.test(readFileSync(filePath, "utf8")))
      .map((filePath) => path.relative(process.cwd(), filePath).replace(/\\/g, "/"));

    expect(violations).toEqual([]);
  });
});

import { readdirSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import {
  AUTH_ROUTES,
  EXPLICIT_PUBLIC_ROUTES,
  hasExplicitProtectedRouteRule,
} from "@/modules/auth/server/route-access";

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

function normalizeAppPagePath(absoluteFilePath: string): string {
  const appDir = path.join(process.cwd(), "app");
  const relative = path.relative(appDir, absoluteFilePath).replace(/\\/g, "/");
  const withoutPageSuffix = relative === "page.tsx"
    ? ""
    : relative.replace(/\/page\.tsx$/, "");
  const withoutLocaleSegment = withoutPageSuffix === "[locale]"
    ? ""
    : withoutPageSuffix.startsWith("[locale]/")
    ? withoutPageSuffix.slice("[locale]".length)
    : `/${withoutPageSuffix}`;
  const normalized = withoutLocaleSegment === "" ? "/" : withoutLocaleSegment;
  return normalized.replace(/\/+/g, "/");
}

describe("route intent guardrail", () => {
  it("requires explicit protected-route registry coverage for non-public pages", () => {
    const appDir = path.join(process.cwd(), "app");
    const pageFiles = collectFilesRecursively(appDir)
      .filter((filePath) => filePath.endsWith("/page.tsx") || filePath.endsWith("page.tsx"));

    const normalizedPaths = [...new Set(pageFiles.map((filePath) => normalizeAppPagePath(filePath)))];
    const violations: string[] = [];

    for (const routePath of normalizedPaths) {
      if (AUTH_ROUTES.has(routePath) || EXPLICIT_PUBLIC_ROUTES.has(routePath)) {
        continue;
      }

      if (!hasExplicitProtectedRouteRule(routePath)) {
        violations.push(routePath);
      }
    }

    expect(violations).toEqual([]);
  });
});

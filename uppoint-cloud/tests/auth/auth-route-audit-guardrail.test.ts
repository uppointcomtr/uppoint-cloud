import { readdirSync, readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

function collectRouteFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectRouteFiles(entryPath);
    }

    return entry.isFile() && entry.name === "route.ts" ? [entryPath] : [];
  });
}

function findViolations(pattern: RegExp): string[] {
  const authRouteRoot = path.join(process.cwd(), "app/api/auth");
  const files = collectRouteFiles(authRouteRoot);

  return files
    .filter((filePath) => pattern.test(readFileSync(filePath, "utf8")))
    .map((filePath) => path.relative(process.cwd(), filePath));
}

describe("auth route audit guardrail", () => {
  it("does not return INVALID_BODY from auth routes without an audit record", () => {
    const offenders = findViolations(
      /catch\s*\{\s*(?!await logAuthInvalidBody\()(?!await logAudit\()return NextResponse\.json\(fail\("INVALID_BODY"\), \{ status: 400 \}\);\s*\}/,
    );

    expect(offenders).toEqual([]);
  });

  it("does not return VALIDATION_FAILED from zod branches without an audit record", () => {
    const offenders = findViolations(
      /if \(error instanceof z\.ZodError\) \{\s*(?!await logAudit\()(?!await logAuthInvalidBody\()return NextResponse\.json\(fail\("VALIDATION_FAILED"\), \{ status: 400 \}\);\s*\}/,
    );

    expect(offenders).toEqual([]);
  });
});

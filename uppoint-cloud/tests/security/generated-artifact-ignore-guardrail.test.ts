import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("generated artifact ignore guardrail", () => {
  it("keeps repo-local generated build artifacts out of eslint traversal", () => {
    const eslintSource = readFileSync(path.join(process.cwd(), "eslint.config.mjs"), "utf8");

    expect(eslintSource).toContain(".hotfix-build-*/**");
    expect(eslintSource).toContain(".next.failed-*/**");
  });

  it("keeps generated hotfix artifacts ignored in app and repo git status", () => {
    const appGitignore = readFileSync(path.join(process.cwd(), ".gitignore"), "utf8");
    const repoGitignore = readFileSync(path.join(process.cwd(), "..", ".gitignore"), "utf8");

    expect(appGitignore).toContain("/.hotfix-build-*/");
    expect(appGitignore).toContain("/.next.failed-*/");
    expect(repoGitignore).toContain(".uppoint-hotfix-build-*/");
  });
});

import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("verify-security-gate script guardrail", () => {
  it("enforces findings and restore-drill freshness checks", () => {
    const scriptPath = path.join(process.cwd(), "scripts", "verify-security-gate.sh");
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain("npm run verify:findings-freshness");
    expect(source).toContain("npm run verify:restore-drill-freshness");
  });

  it("supports explicit remote smoke enforcement flag in read-only mode", () => {
    const scriptPath = path.join(process.cwd(), "scripts", "verify-security-gate.sh");
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain("SECURITY_GATE_REQUIRE_REMOTE_SMOKE");
    expect(source).toContain("E2E_ALLOW_MUTATIONS=0 npm run test:e2e:remote");
  });
});

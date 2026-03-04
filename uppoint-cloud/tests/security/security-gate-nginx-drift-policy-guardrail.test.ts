import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("security gate nginx drift policy guardrail", () => {
  it("enforces baseline drift policy by default in security gate", () => {
    const scriptPath = path.join(process.cwd(), "scripts", "verify-security-gate.sh");
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain('RATE_LIMIT_DRIFT_POLICY="${RATE_LIMIT_DRIFT_POLICY:-enforce-baseline}" npm run verify:nginx-drift');
  });
});

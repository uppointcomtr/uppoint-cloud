import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("security release gate workflow guardrail", () => {
  it("keeps release gate workflow on self-hosted runner with canonical security gate step", () => {
    const workflowPath = path.join(
      process.cwd(),
      "..",
      ".github",
      "workflows",
      "security-release-gate.yml",
    );
    const source = readFileSync(workflowPath, "utf8");

    expect(source).toContain("name: Security Release Gate");
    expect(source).toContain("runs-on: self-hosted");
    expect(source).toContain("npm run verify:security-gate");
    expect(source).toContain("SECURITY_GATE_REQUIRE_EDGE_AUDIT_EMIT: ${{ github.event_name == 'pull_request' && '0' || '1' }}");
    expect(source).toContain("Remote auth smoke (release gate)");
    expect(source).toContain("E2E_ALLOW_MUTATIONS: \"0\"");
  });
});

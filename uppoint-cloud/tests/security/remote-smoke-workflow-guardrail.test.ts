import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("remote smoke workflow guardrail", () => {
  it("blocks mutation runs against production target across all trigger types", () => {
    const workflowPath = path.join(
      process.cwd(),
      "..",
      ".github",
      "workflows",
      "remote-auth-smoke.yml",
    );
    const source = readFileSync(workflowPath, "utf8");

    expect(source).toContain("Guard against mutation smoke on production target");
    expect(source).toContain("if [ \"${E2E_MUTATIONS_ENABLED}\" = \"1\" ] && [ \"${target}\" = \"https://cloud.uppoint.com.tr\" ]");
    expect(source).not.toContain("if: github.event_name == 'schedule'");
  });
});

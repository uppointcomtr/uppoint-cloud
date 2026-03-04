import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("remote smoke workflow guardrail", () => {
  it("keeps self-hosted runner selection configurable via JSON labels", () => {
    const workflowPath = path.join(
      process.cwd(),
      "..",
      ".github",
      "workflows",
      "remote-auth-smoke.yml",
    );
    const source = readFileSync(workflowPath, "utf8");

    expect(source).toContain("runner_labels_json:");
    expect(source).toContain("runs-on: ${{ fromJSON(inputs.runner_labels_json || vars.E2E_RUNNER_LABELS_JSON || '[\"self-hosted\"]') }}");
    expect(source).toContain("E2E_RUNNER_LABELS_JSON: ${{ inputs.runner_labels_json || vars.E2E_RUNNER_LABELS_JSON || '[\"self-hosted\"]' }}");
  });

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

  it("enforces production health checks with explicit token requirement", () => {
    const workflowPath = path.join(
      process.cwd(),
      "..",
      ".github",
      "workflows",
      "remote-auth-smoke.yml",
    );
    const source = readFileSync(workflowPath, "utf8");

    expect(source).toContain("E2E_ENFORCE_HEALTH_200: ${{ inputs.enforce_health_200 || vars.E2E_ENFORCE_HEALTH_200 || '1' }}");
    expect(source).toContain("Require healthcheck token for production target");
    expect(source).toContain("if [ \"${target}\" = \"https://cloud.uppoint.com.tr\" ] && [ -z \"${E2E_TOKEN:-}\" ]; then");
  });
});

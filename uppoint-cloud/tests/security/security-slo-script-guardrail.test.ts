import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("security slo script guardrail", () => {
  it("defines absolute notification failure threshold alerting", () => {
    const scriptPath = path.join(process.cwd(), "scripts", "check-security-slo.mjs");
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain("SECURITY_SLO_MAX_NOTIFICATION_FAILED_ABSOLUTE");
    expect(source).toContain("notification_delivery_failed_absolute");
  });
});

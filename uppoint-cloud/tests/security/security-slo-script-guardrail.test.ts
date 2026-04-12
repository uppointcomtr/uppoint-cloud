import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("security slo script guardrail", () => {
  it("defines absolute notification failure threshold alerting", () => {
    const scriptPath = path.join(process.cwd(), "scripts", "check-security-slo.mjs");
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain("SECURITY_SLO_MAX_NOTIFICATION_FAILED_ABSOLUTE");
    expect(source).toContain("notification_delivery_failed_absolute");
    expect(source).toContain("SECURITY_SLO_MAX_LOW_SAMPLE_NOTIFICATION_FAILED_ABSOLUTE");
    expect(source).toContain("notification_delivery_failed_low_sample_absolute");
    expect(source).toContain("SECURITY_SLO_WARN_ON_LOW_NOTIFICATION_SAMPLE");
    expect(source).toContain("notification_terminal_sample_low");
    expect(source).toContain("SECURITY_SLO_MAX_AUTH_NOTIFICATION_P95_SECONDS");
    expect(source).toContain("SECURITY_SLO_MAX_AUTH_NOTIFICATION_FAILED_ABSOLUTE");
    expect(source).toContain("auth_notification_failed_absolute");
    expect(source).toContain("auth_notification_latency_p95");
    expect(source).toContain("auth_notification_sample_low");
  });
});

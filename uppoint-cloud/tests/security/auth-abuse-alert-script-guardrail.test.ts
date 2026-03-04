import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("auth abuse alert script guardrail", () => {
  it("keeps local alert sink active in closed-system mode", () => {
    const scriptPath = path.join(process.cwd(), "scripts", "alert-auth-abuse.sh");
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain("DEFAULT_LOCAL_ALERT_LOG_PATH=\"/var/log/uppoint-cloud/security-alerts.log\"");
    expect(source).toContain("emit_local_alert \"closed-system-auth-abuse-threshold-exceeded\"");
    expect(source).toContain("logger -t uppoint-security-alert");
  });
});


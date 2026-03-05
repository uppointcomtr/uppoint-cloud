import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("notification canary guardrail", () => {
  it("keeps cron template wired to canary script", () => {
    const cronPath = path.join(process.cwd(), "ops", "cron", "uppoint-notification-canary");
    const source = readFileSync(cronPath, "utf8");

    expect(source).toContain("run-notification-canary.sh");
    expect(source).toContain("/var/log/uppoint-notification-canary.log");
    expect(source).toContain("/usr/sbin/runuser -u www-data");
  });

  it("keeps canary scope and closed-system safe env behavior", () => {
    const scriptPath = path.join(process.cwd(), "scripts", "run-notification-canary.sh");
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain("ops-notification-canary");
    expect(source).toContain("UPPOINT_NOTIFICATION_CANARY_ENABLED");
    expect(source).toContain("UPPOINT_NOTIFICATION_CANARY_MODE");
    expect(source).toContain("UPPOINT_NOTIFICATION_CANARY_EMAIL_TO");
    expect(source).toContain("UPPOINT_ALERT_EMAIL_TO");
    expect(source).toContain("probe-only");
    expect(source).toContain("enqueue-email");
  });
});

import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("restore drill report guardrail", () => {
  it("keeps restore-drill cron wired to report wrapper", () => {
    const cronPath = path.join(process.cwd(), "ops", "cron", "uppoint-postgres-restore-drill");
    const source = readFileSync(cronPath, "utf8");

    expect(source).toContain("run-restore-drill-with-report.sh");
  });

  it("enqueues encrypted restore drill status email via outbox", () => {
    const scriptPath = path.join(process.cwd(), "scripts", "run-restore-drill-with-report.sh");
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain("UPPOINT_RESTORE_DRILL_EMAIL_ENABLED");
    expect(source).toContain("UPPOINT_RESTORE_DRILL_EMAIL_TO");
    expect(source).toContain("UPPOINT_ALERT_EMAIL_TO");
    expect(source).toContain("NOTIFICATION_PAYLOAD_SECRET");
    expect(source).toContain("NotificationOutbox");
    expect(source).toContain("ops-restore-drill-report");
    expect(source).toContain("restore-drill-db.sh");
  });
});

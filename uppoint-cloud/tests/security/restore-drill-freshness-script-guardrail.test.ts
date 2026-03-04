import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("restore drill freshness script guardrail", () => {
  it("fails when cron exists but restore-drill log is missing or stale", () => {
    const scriptPath = path.join(process.cwd(), "scripts", "check-restore-drill-freshness.sh");
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain("/etc/cron.d/uppoint-postgres-restore-drill");
    expect(source).toContain("/var/log/uppoint-postgres-restore-drill.log");
    expect(source).toContain("RESTORE_DRILL_FRESHNESS_MAX_HOURS");
    expect(source).toContain("stale log");
  });
});

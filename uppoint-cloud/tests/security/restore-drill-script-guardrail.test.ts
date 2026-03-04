import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("restore drill script guardrail", () => {
  it("enforces execute kill-switch and safe drill target constraints", () => {
    const scriptPath = path.join(process.cwd(), "scripts", "restore-drill-db.sh");
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain("UPPOINT_ENABLE_RESTORE_DRILL_EXECUTE");
    expect(source).toContain("execute mode is disabled");
    expect(source).toContain("restore_drill_");
    expect(source).toContain("refusing to use primary database name");
    expect(source).toContain("drill target database already exists");
  });

  it("drops drill database only when this script created it", () => {
    const scriptPath = path.join(process.cwd(), "scripts", "restore-drill-db.sh");
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain("DRILL_DB_CREATED=0");
    expect(source).toContain("if [ \"$DRILL_DB_CREATED\" -ne 1 ]; then");
  });
});

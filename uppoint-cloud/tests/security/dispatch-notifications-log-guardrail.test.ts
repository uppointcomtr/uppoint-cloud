import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("dispatch notifications log guardrail", () => {
  it("includes request id and batch counters in success logs", () => {
    const scriptPath = path.join(process.cwd(), "scripts", "dispatch-notifications.sh");
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain("requestId=");
    expect(source).toContain("inspected=");
    expect(source).toContain("sent=");
    expect(source).toContain("failed=");
  });
});

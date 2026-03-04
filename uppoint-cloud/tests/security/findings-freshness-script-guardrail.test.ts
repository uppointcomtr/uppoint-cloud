import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("findings freshness script guardrail", () => {
  it("checks unresolved findings and stale high-severity closures", () => {
    const scriptPath = path.join(process.cwd(), "scripts", "check-findings-freshness.mjs");
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain("open");
    expect(source).toContain("in_progress");
    expect(source).toContain("blocked");
    expect(source).toContain("high");
    expect(source).toContain("critical");
    expect(source).toContain("FINDINGS_MAX_AGE_DAYS");
  });
});

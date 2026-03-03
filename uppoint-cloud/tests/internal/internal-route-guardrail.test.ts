import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

interface InternalRouteGuardrailCase {
  label: string;
  routePath: string;
  expectedPathLiteral: string;
  expectedTokenHeaderName: string;
}

const CASES: InternalRouteGuardrailCase[] = [
  {
    label: "internal audit security-event route",
    routePath: "app/api/internal/audit/security-event/route.ts",
    expectedPathLiteral: "/api/internal/audit/security-event",
    expectedTokenHeaderName: "x-internal-audit-token",
  },
  {
    label: "internal notifications dispatch route",
    routePath: "app/api/internal/notifications/dispatch/route.ts",
    expectedPathLiteral: "/api/internal/notifications/dispatch",
    expectedTokenHeaderName: "x-internal-dispatch-token",
  },
];

describe("internal route auth guardrail", () => {
  it.each(CASES)("enforces loopback, signed auth and replay guard for $label", (testCase) => {
    const source = readFileSync(path.join(process.cwd(), testCase.routePath), "utf8");

    expect(source).toContain("verifyInternalRequestAuth({");
    expect(source).toContain(`expectedPath: "${testCase.expectedPathLiteral}"`);
    expect(source).toContain(`tokenHeaderName: "${testCase.expectedTokenHeaderName}"`);
    expect(source).toContain("requireLoopbackSource: env.NODE_ENV === \"production\"");
    expect(source).toContain("withRateLimit(");
    expect(source).toContain("withRateLimitByIdentifier(");
  });
});

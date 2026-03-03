import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withIdempotency: vi.fn(),
  withRateLimit: vi.fn(),
  getClientIp: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/http/idempotency", () => ({
  withIdempotency: mocks.withIdempotency,
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: mocks.withRateLimit,
  withRateLimitByIdentifier: vi.fn(),
  getClientIp: mocks.getClientIp,
}));

vi.mock("@/lib/audit-log", () => ({
  logAudit: mocks.logAudit,
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next-auth/jwt", () => ({
  getToken: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    AUTH_SECRET: "a".repeat(32),
  },
}));

vi.mock("@/lib/session-revocation", () => ({
  revokeSessionJti: vi.fn(),
}));

import * as logoutRoute from "@/app/api/auth/logout/route";

describe("logout route idempotency", () => {
  it("wraps logout execution in idempotency guard", async () => {
    mocks.withIdempotency.mockImplementation((_action, handler: () => Promise<Response>) => handler());
    mocks.withRateLimit.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: "TOO_MANY_REQUESTS" }), { status: 429 }),
    );
    mocks.getClientIp.mockResolvedValue("203.0.113.9");
    mocks.logAudit.mockResolvedValue(undefined);

    const response = await logoutRoute.POST(
      new Request("https://cloud.uppoint.com.tr/api/auth/logout", { method: "POST" }) as never,
    );

    expect(response.status).toBe(429);
    expect(mocks.withIdempotency).toHaveBeenCalledTimes(1);
    expect(mocks.withIdempotency).toHaveBeenCalledWith("auth:logout", expect.any(Function));
  });
});

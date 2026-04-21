import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withIdempotency: vi.fn(),
  enforceFailClosedIpRateLimit: vi.fn(),
  enforceFailClosedIdentifierRateLimit: vi.fn(),
  auth: vi.fn(),
  getToken: vi.fn(),
  revokeSessionJti: vi.fn(),
  logAudit: vi.fn(),
  logServerError: vi.fn(),
}));

vi.mock("@/lib/http/idempotency", () => ({
  withIdempotency: mocks.withIdempotency,
}));

vi.mock("@/lib/security/route-guard", () => ({
  enforceFailClosedIpRateLimit: mocks.enforceFailClosedIpRateLimit,
  enforceFailClosedIdentifierRateLimit: mocks.enforceFailClosedIdentifierRateLimit,
}));

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("next-auth/jwt", () => ({
  getToken: mocks.getToken,
}));

vi.mock("@/lib/session-revocation", () => ({
  revokeSessionJti: mocks.revokeSessionJti,
}));

vi.mock("@/lib/audit-log", () => ({
  logAudit: mocks.logAudit,
}));

vi.mock("@/lib/observability/safe-server-error-log", () => ({
  logServerError: mocks.logServerError,
}));

vi.mock("@/lib/env", () => ({
  env: {
    AUTH_SECRET: "a".repeat(32),
  },
}));

import * as logoutRoute from "@/app/api/auth/logout/route";

describe("logout route audit behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails closed when an authenticated session lacks revocable token metadata", async () => {
    mocks.withIdempotency.mockImplementation(async (_key: string, handler: () => Promise<Response>) => handler());
    mocks.enforceFailClosedIpRateLimit.mockResolvedValue({
      blockedResponse: null,
      ip: "203.0.113.10",
    });
    mocks.enforceFailClosedIdentifierRateLimit.mockResolvedValue(null);
    mocks.auth.mockResolvedValue({ user: { id: "user_1" } });
    mocks.getToken.mockResolvedValue({ sessionJti: null, exp: null });
    mocks.logAudit.mockResolvedValue(undefined);

    const request = {
      headers: new Headers({ "x-forwarded-proto": "https" }),
      nextUrl: new URL("https://cloud.uppoint.com.tr/api/auth/logout"),
    } as unknown as Parameters<typeof logoutRoute.POST>[0];

    const response = await logoutRoute.POST(request);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      success: false,
      error: "LOGOUT_SESSION_INVALID",
      code: "LOGOUT_SESSION_INVALID",
    });
    expect(mocks.revokeSessionJti).not.toHaveBeenCalled();
    expect(mocks.logAudit).toHaveBeenCalledWith(
      "logout_failed",
      "203.0.113.10",
      "user_1",
      expect.objectContaining({
        reason: "REVOCABLE_SESSION_MISSING",
        result: "FAILURE",
        scope: "single-session",
      }),
    );
  });

  it("emits only canonical logout_success audit for a valid session token", async () => {
    mocks.withIdempotency.mockImplementation(async (_key: string, handler: () => Promise<Response>) => handler());
    mocks.enforceFailClosedIpRateLimit.mockResolvedValue({
      blockedResponse: null,
      ip: "203.0.113.10",
    });
    mocks.enforceFailClosedIdentifierRateLimit.mockResolvedValue(null);
    mocks.auth.mockResolvedValue({ user: { id: "user_1" } });
    mocks.getToken.mockResolvedValue({
      sessionJti: "jti_1",
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    mocks.revokeSessionJti.mockResolvedValue(undefined);
    mocks.logAudit.mockResolvedValue(undefined);

    const request = {
      headers: new Headers({ "x-forwarded-proto": "https" }),
      nextUrl: new URL("https://cloud.uppoint.com.tr/api/auth/logout"),
    } as unknown as Parameters<typeof logoutRoute.POST>[0];

    const response = await logoutRoute.POST(request);

    expect(response.status).toBe(200);
    expect(mocks.revokeSessionJti).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      "logout_success",
      "203.0.113.10",
      "user_1",
      expect.objectContaining({
        scope: "single-session",
        tokenRevoked: true,
      }),
    );
    expect(mocks.logAudit).not.toHaveBeenCalledWith(
      "session_revoked",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
});

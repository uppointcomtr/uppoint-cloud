import { beforeEach, describe, expect, it, vi } from "vitest";

const logAuditMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const withRateLimitByIdentifierMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({
  env: {
    NODE_ENV: "production",
  },
}));

vi.mock("@/lib/audit-log", () => ({
  logAudit: logAuditMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  withRateLimitByIdentifier: withRateLimitByIdentifierMock,
}));

import * as verifyEmailRoute from "@/app/api/auth/verify-email/route";
import * as forgotRequestRoute from "@/app/api/auth/forgot-password/request/route";
import * as forgotResetRoute from "@/app/api/auth/forgot-password/reset/route";

describe("deprecated auth routes fail closed without trusted rate-limit context in production", () => {
  beforeEach(() => {
    logAuditMock.mockClear();
    checkRateLimitMock.mockClear();
    withRateLimitByIdentifierMock.mockClear();
  });

  it("returns 503 for verify-email when request context is unavailable", async () => {
    const response = await verifyEmailRoute.POST();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "RATE_LIMIT_CONTEXT_UNAVAILABLE",
      code: "RATE_LIMIT_CONTEXT_UNAVAILABLE",
    });
    expect(logAuditMock).toHaveBeenCalledWith(
      "deprecated_endpoint_access",
      "unknown",
      undefined,
      expect.objectContaining({
        endpoint: "/api/auth/verify-email",
        reason: "RATE_LIMIT_CONTEXT_UNAVAILABLE",
        result: "FAILURE",
      }),
    );
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(withRateLimitByIdentifierMock).not.toHaveBeenCalled();
  });

  it("returns 503 for forgot-password request when request context is unavailable", async () => {
    const response = await forgotRequestRoute.POST();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "RATE_LIMIT_CONTEXT_UNAVAILABLE",
      code: "RATE_LIMIT_CONTEXT_UNAVAILABLE",
    });
    expect(logAuditMock).toHaveBeenCalledWith(
      "deprecated_endpoint_access",
      "unknown",
      undefined,
      expect.objectContaining({
        endpoint: "/api/auth/forgot-password/request",
        reason: "RATE_LIMIT_CONTEXT_UNAVAILABLE",
        result: "FAILURE",
      }),
    );
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(withRateLimitByIdentifierMock).not.toHaveBeenCalled();
  });

  it("returns 503 for forgot-password reset when request context is unavailable", async () => {
    const response = await forgotResetRoute.POST();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "RATE_LIMIT_CONTEXT_UNAVAILABLE",
      code: "RATE_LIMIT_CONTEXT_UNAVAILABLE",
    });
    expect(logAuditMock).toHaveBeenCalledWith(
      "deprecated_endpoint_access",
      "unknown",
      undefined,
      expect.objectContaining({
        endpoint: "/api/auth/forgot-password/reset",
        reason: "RATE_LIMIT_CONTEXT_UNAVAILABLE",
        result: "FAILURE",
      }),
    );
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(withRateLimitByIdentifierMock).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const logAuditMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const checkRateLimitMock = vi.hoisted(() => vi.fn().mockResolvedValue({ allowed: true }));
const withRateLimitByIdentifierMock = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock("@/lib/audit-log", () => ({
  logAudit: logAuditMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  withRateLimitByIdentifier: withRateLimitByIdentifierMock,
}));

import * as verifyEmailRoute from "@/app/api/auth/verify-email/route";

describe("deprecated verify-email route", () => {
  beforeEach(() => {
    logAuditMock.mockClear();
    checkRateLimitMock.mockClear();
    withRateLimitByIdentifierMock.mockClear();
  });

  it("returns 410 for GET /api/auth/verify-email", async () => {
    const response = await verifyEmailRoute.GET();
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "ENDPOINT_DEPRECATED",
      code: "ENDPOINT_DEPRECATED",
    });
    expect(logAuditMock).toHaveBeenCalledWith(
      "deprecated_endpoint_access",
      expect.any(String),
      undefined,
      expect.objectContaining({
        endpoint: "/api/auth/verify-email",
        method: "GET",
      }),
    );
  });

  it("returns 410 for POST /api/auth/verify-email", async () => {
    const response = await verifyEmailRoute.POST();
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "ENDPOINT_DEPRECATED",
      code: "ENDPOINT_DEPRECATED",
    });
    expect(logAuditMock).toHaveBeenCalledWith(
      "deprecated_endpoint_access",
      expect.any(String),
      undefined,
      expect.objectContaining({
        endpoint: "/api/auth/verify-email",
        method: "POST",
      }),
    );
  });
});

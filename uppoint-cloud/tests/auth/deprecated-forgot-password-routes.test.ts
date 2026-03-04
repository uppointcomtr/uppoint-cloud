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

import * as requestRoute from "@/app/api/auth/forgot-password/request/route";
import * as resetRoute from "@/app/api/auth/forgot-password/reset/route";

describe("deprecated forgot-password routes", () => {
  beforeEach(() => {
    logAuditMock.mockClear();
    checkRateLimitMock.mockClear();
    withRateLimitByIdentifierMock.mockClear();
  });

  it("returns 410 for POST /api/auth/forgot-password/request", async () => {
    const response = await requestRoute.POST();
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
        endpoint: "/api/auth/forgot-password/request",
        method: "POST",
      }),
    );
  });

  it("returns 410 for POST /api/auth/forgot-password/reset", async () => {
    const response = await resetRoute.POST();
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
        endpoint: "/api/auth/forgot-password/reset",
        method: "POST",
      }),
    );
  });
});

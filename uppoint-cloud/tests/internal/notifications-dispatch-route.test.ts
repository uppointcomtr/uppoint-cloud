import { describe, expect, it, vi } from "vitest";

const {
  logAuditMock,
  withRateLimitMock,
  withRateLimitByIdentifierMock,
  getClientIpMock,
  verifyInternalRequestAuthMock,
  dispatchNotificationOutboxBatchMock,
} = vi.hoisted(() => ({
  logAuditMock: vi.fn(),
  withRateLimitMock: vi.fn(),
  withRateLimitByIdentifierMock: vi.fn(),
  getClientIpMock: vi.fn().mockResolvedValue("unknown"),
  verifyInternalRequestAuthMock: vi.fn(),
  dispatchNotificationOutboxBatchMock: vi.fn(),
}));

vi.mock("@/lib/audit-log", () => ({
  logAudit: logAuditMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: withRateLimitMock,
  withRateLimitByIdentifier: withRateLimitByIdentifierMock,
  getClientIp: getClientIpMock,
}));

vi.mock("@/lib/security/internal-request-auth", () => ({
  verifyInternalRequestAuth: verifyInternalRequestAuthMock,
}));

vi.mock("@/modules/notifications/server/outbox", () => ({
  dispatchNotificationOutboxBatch: dispatchNotificationOutboxBatchMock,
}));

vi.mock("@/lib/env", () => ({
  env: {
    INTERNAL_DISPATCH_TOKEN: "x".repeat(32),
    INTERNAL_DISPATCH_SIGNING_SECRET: "y".repeat(32),
  },
}));

import * as dispatchRoute from "@/app/api/internal/notifications/dispatch/route";

describe("internal notifications dispatch route", () => {
  it("audits unauthorized internal requests", async () => {
    withRateLimitMock.mockResolvedValueOnce(null);
    verifyInternalRequestAuthMock.mockResolvedValueOnce(null);
    logAuditMock.mockResolvedValueOnce(undefined);

    const response = await dispatchRoute.POST(
      new Request("https://cloud.uppoint.com.tr/api/internal/notifications/dispatch", {
        method: "POST",
        headers: {
          "x-internal-request-id": "req_unauthorized_dispatch_1",
        },
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "UNAUTHORIZED",
      code: "UNAUTHORIZED",
    });
    expect(logAuditMock).toHaveBeenCalledWith(
      "internal_dispatch_unauthorized",
      "unknown",
      undefined,
      expect.objectContaining({
        requestId: "req_unauthorized_dispatch_1",
        reason: "INVALID_INTERNAL_REQUEST_AUTH",
        result: "FAILURE",
      }),
    );
  });

  it("audits invalid body payloads from authorized internal requests", async () => {
    withRateLimitMock.mockResolvedValueOnce(null);
    verifyInternalRequestAuthMock.mockResolvedValueOnce({
      requestId: "req_invalid_dispatch_body_1",
      rawBody: "{\"unexpected\":true}",
    });
    logAuditMock.mockResolvedValueOnce(undefined);

    const response = await dispatchRoute.POST(
      new Request("https://cloud.uppoint.com.tr/api/internal/notifications/dispatch", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "INVALID_BODY",
      code: "INVALID_BODY",
    });
    expect(logAuditMock).toHaveBeenCalledWith(
      "internal_dispatch_failed",
      "unknown",
      undefined,
      expect.objectContaining({
        requestId: "req_invalid_dispatch_body_1",
        reason: "INVALID_BODY",
        result: "FAILURE",
      }),
    );
  });
});

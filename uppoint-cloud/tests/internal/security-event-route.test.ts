import { describe, expect, it, vi } from "vitest";

const {
  logAuditMock,
  withRateLimitMock,
  withRateLimitByIdentifierMock,
  getClientIpMock,
  verifyInternalRequestAuthMock,
} = vi.hoisted(() => ({
  logAuditMock: vi.fn(),
  withRateLimitMock: vi.fn(),
  withRateLimitByIdentifierMock: vi.fn(),
  getClientIpMock: vi.fn().mockResolvedValue("unknown"),
  verifyInternalRequestAuthMock: vi.fn(),
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

vi.mock("@/lib/env", () => ({
  env: {
    INTERNAL_AUDIT_TOKEN: "a".repeat(32),
    INTERNAL_AUDIT_SIGNING_SECRET: "b".repeat(32),
  },
}));

import * as securityEventRoute from "@/app/api/internal/audit/security-event/route";

describe("internal security event route", () => {
  it("audits unauthorized internal requests", async () => {
    withRateLimitMock.mockResolvedValueOnce(null);
    verifyInternalRequestAuthMock.mockResolvedValueOnce(null);
    logAuditMock.mockResolvedValueOnce(undefined);

    const response = await securityEventRoute.POST(
      new Request("https://cloud.uppoint.com.tr/api/internal/audit/security-event", {
        method: "POST",
        headers: {
          "x-internal-request-id": "req_unauthorized_security_event_1",
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
      "internal_audit_security_event_unauthorized",
      "unknown",
      undefined,
      expect.objectContaining({
        requestId: "req_unauthorized_security_event_1",
        reason: "INVALID_INTERNAL_REQUEST_AUTH",
        result: "FAILURE",
      }),
    );
  });

  it("audits replay-blocked internal requests", async () => {
    withRateLimitMock.mockResolvedValueOnce(null);
    verifyInternalRequestAuthMock.mockResolvedValueOnce({
      requestId: "req_replay_security_event_1",
      rawBody: "",
    });
    withRateLimitByIdentifierMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: "TOO_MANY_REQUESTS" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );
    logAuditMock.mockResolvedValueOnce(undefined);

    const response = await securityEventRoute.POST(
      new Request("https://cloud.uppoint.com.tr/api/internal/audit/security-event", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(429);
    expect(logAuditMock).toHaveBeenCalledWith(
      "internal_audit_security_event_replay_blocked",
      "unknown",
      undefined,
      expect.objectContaining({
        requestId: "req_replay_security_event_1",
        reason: "REPLAY_OR_DUPLICATE_REQUEST_ID",
        result: "FAILURE",
      }),
    );
  });

  it("audits invalid body payloads from authorized internal requests", async () => {
    withRateLimitMock.mockResolvedValueOnce(null);
    verifyInternalRequestAuthMock.mockResolvedValueOnce({
      requestId: "req_invalid_payload_1",
      rawBody: "{",
    });
    withRateLimitByIdentifierMock.mockResolvedValueOnce(null);
    logAuditMock.mockResolvedValueOnce(undefined);

    const response = await securityEventRoute.POST(
      new Request("https://cloud.uppoint.com.tr/api/internal/audit/security-event", {
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
      "internal_audit_security_event_invalid_body",
      "unknown",
      undefined,
      expect.objectContaining({
        requestId: "req_invalid_payload_1",
        reason: "JSON_PARSE_FAILED",
        result: "FAILURE",
      }),
    );
  });
});

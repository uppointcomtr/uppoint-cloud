import { describe, expect, it, vi } from "vitest";

const {
  logAuditMock,
  withRateLimitMock,
  withRateLimitByIdentifierMock,
  getClientIpMock,
  verifyInternalRequestAuthMock,
  reportProvisioningJobMock,
} = vi.hoisted(() => ({
  logAuditMock: vi.fn(),
  withRateLimitMock: vi.fn(),
  withRateLimitByIdentifierMock: vi.fn(),
  getClientIpMock: vi.fn().mockResolvedValue("unknown"),
  verifyInternalRequestAuthMock: vi.fn(),
  reportProvisioningJobMock: vi.fn(),
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

vi.mock("@/db/repositories/instance-control-plane-repository", () => ({
  reportProvisioningJob: reportProvisioningJobMock,
  InstanceProvisioningControlPlaneError: class InstanceProvisioningControlPlaneError extends Error {
    code = "UNKNOWN";
  },
}));

vi.mock("@/lib/env", () => ({
  env: {
    INTERNAL_PROVISIONING_TOKEN: "a".repeat(32),
    INTERNAL_PROVISIONING_SIGNING_SECRET: "b".repeat(32),
    INTERNAL_AUTH_TRANSPORT_MODE: "loopback-hmac-v1",
  },
}));

import * as reportRoute from "@/app/api/internal/instances/provisioning/report/route";

describe("internal instance provisioning report route", () => {
  it("audits unauthorized internal requests", async () => {
    withRateLimitMock.mockResolvedValueOnce(null);
    verifyInternalRequestAuthMock.mockResolvedValueOnce(null);
    logAuditMock.mockResolvedValueOnce(undefined);

    const response = await reportRoute.POST(
      new Request("https://cloud.uppoint.com.tr/api/internal/instances/provisioning/report", {
        method: "POST",
        headers: {
          "x-internal-request-id": "req_unauthorized_report_1",
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
      "internal_provisioning_unauthorized",
      "unknown",
      undefined,
      expect.objectContaining({
        requestId: "req_unauthorized_report_1",
        reason: "INVALID_INTERNAL_REQUEST_AUTH",
        result: "FAILURE",
      }),
    );
  });

  it("rejects invalid JSON payloads", async () => {
    withRateLimitMock.mockResolvedValueOnce(null);
    verifyInternalRequestAuthMock.mockResolvedValueOnce({
      requestId: "req_report_invalid_json_1",
      rawBody: "{",
    });
    withRateLimitByIdentifierMock.mockResolvedValueOnce(null);
    logAuditMock.mockResolvedValueOnce(undefined);

    const response = await reportRoute.POST(
      new Request("https://cloud.uppoint.com.tr/api/internal/instances/provisioning/report", {
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
      "internal_provisioning_report_failed",
      "unknown",
      undefined,
      expect.objectContaining({
        requestId: "req_report_invalid_json_1",
        reason: "JSON_PARSE_FAILED",
        result: "FAILURE",
      }),
    );
  });

  it("reports provisioning completion and emits completion audit", async () => {
    withRateLimitMock.mockResolvedValueOnce(null);
    verifyInternalRequestAuthMock.mockResolvedValueOnce({
      requestId: "req_report_success_1",
      rawBody: JSON.stringify({
        workerId: "incus-worker-1",
        jobId: "job_1",
        eventType: "provisioning_completed",
        providerRef: "incus/vm-one",
      }),
    });
    withRateLimitByIdentifierMock.mockResolvedValueOnce(null);
    withRateLimitByIdentifierMock.mockResolvedValueOnce(null);
    reportProvisioningJobMock.mockResolvedValueOnce({
      jobId: "job_1",
      state: "completed",
      terminal: true,
      retryScheduled: false,
      attemptCount: 1,
      maxAttempts: 5,
      nextAttemptAt: new Date("2026-04-23T10:00:00.000Z"),
      providerRef: "incus/vm-one",
      providerMessage: null,
    });
    logAuditMock.mockResolvedValue(undefined);

    const response = await reportRoute.POST(
      new Request("https://cloud.uppoint.com.tr/api/internal/instances/provisioning/report", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: expect.objectContaining({
        jobId: "job_1",
        state: "completed",
      }),
    });
    expect(reportProvisioningJobMock).toHaveBeenCalledWith(expect.objectContaining({
      workerId: "incus-worker-1",
      jobId: "job_1",
      eventType: "provisioning_completed",
    }));
    expect(logAuditMock).toHaveBeenCalledWith(
      "instance_provisioning_completed",
      "unknown",
      undefined,
      expect.objectContaining({
        requestId: "req_report_success_1",
        targetId: "job_1",
      }),
    );
  });
});

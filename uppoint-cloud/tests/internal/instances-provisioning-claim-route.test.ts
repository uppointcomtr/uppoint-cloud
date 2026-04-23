import { describe, expect, it, vi } from "vitest";

const {
  logAuditMock,
  withRateLimitMock,
  withRateLimitByIdentifierMock,
  getClientIpMock,
  verifyInternalRequestAuthMock,
  claimProvisioningJobsMock,
} = vi.hoisted(() => ({
  logAuditMock: vi.fn(),
  withRateLimitMock: vi.fn(),
  withRateLimitByIdentifierMock: vi.fn(),
  getClientIpMock: vi.fn().mockResolvedValue("unknown"),
  verifyInternalRequestAuthMock: vi.fn(),
  claimProvisioningJobsMock: vi.fn(),
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
  claimProvisioningJobs: claimProvisioningJobsMock,
  InstanceProvisioningControlPlaneError: class InstanceProvisioningControlPlaneError extends Error {
    code = "UNKNOWN";
  },
}));

vi.mock("@/lib/env", () => ({
  env: {
    INTERNAL_PROVISIONING_TOKEN: "a".repeat(32),
    INTERNAL_PROVISIONING_SIGNING_SECRET: "b".repeat(32),
    INTERNAL_AUTH_TRANSPORT_MODE: "loopback-hmac-v1",
    KVM_WORKER_BATCH_SIZE: 10,
    KVM_WORKER_LOCK_STALE_SECONDS: 180,
  },
}));

import * as claimRoute from "@/app/api/internal/instances/provisioning/claim/route";

describe("internal instance provisioning claim route", () => {
  it("audits unauthorized internal requests", async () => {
    withRateLimitMock.mockResolvedValueOnce(null);
    verifyInternalRequestAuthMock.mockResolvedValueOnce(null);
    logAuditMock.mockResolvedValueOnce(undefined);

    const response = await claimRoute.POST(
      new Request("https://cloud.uppoint.com.tr/api/internal/instances/provisioning/claim", {
        method: "POST",
        headers: {
          "x-internal-request-id": "req_unauthorized_claim_1",
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
        requestId: "req_unauthorized_claim_1",
        reason: "INVALID_INTERNAL_REQUEST_AUTH",
        result: "FAILURE",
      }),
    );
  });

  it("rejects invalid JSON payloads", async () => {
    withRateLimitMock.mockResolvedValueOnce(null);
    verifyInternalRequestAuthMock.mockResolvedValueOnce({
      requestId: "req_claim_invalid_json_1",
      rawBody: "{",
    });
    withRateLimitByIdentifierMock.mockResolvedValueOnce(null);
    logAuditMock.mockResolvedValueOnce(undefined);

    const response = await claimRoute.POST(
      new Request("https://cloud.uppoint.com.tr/api/internal/instances/provisioning/claim", {
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
      "internal_provisioning_claim_failed",
      "unknown",
      undefined,
      expect.objectContaining({
        requestId: "req_claim_invalid_json_1",
        reason: "JSON_PARSE_FAILED",
        result: "FAILURE",
      }),
    );
  });

  it("returns claimed jobs and emits started audit logs", async () => {
    withRateLimitMock.mockResolvedValueOnce(null);
    verifyInternalRequestAuthMock.mockResolvedValueOnce({
      requestId: "req_claim_success_1",
      rawBody: JSON.stringify({
        workerId: "incus-worker-1",
        batchSize: 2,
        lockStaleSeconds: 180,
      }),
    });
    withRateLimitByIdentifierMock.mockResolvedValueOnce(null);
    withRateLimitByIdentifierMock.mockResolvedValueOnce(null);
    claimProvisioningJobsMock.mockResolvedValueOnce([
      {
        jobId: "job_1",
        tenantId: "tenant_1",
        resourceGroupId: "rg_1",
        requestedByUserId: "user_1",
        attemptCount: 1,
        maxAttempts: 5,
        requestPayload: {},
        providerRef: null,
        providerMessage: null,
        network: {
          networkId: "net_1",
          name: "default-vnet",
          cidr: "10.10.10.0/24",
        },
        instance: {
          instanceId: "instance_1",
          name: "vm-one",
          planCode: "vm-basic-1",
          imageCode: "ubuntu-24-04-lts",
          regionCode: "tr-ist-1",
          cpuCores: 2,
          memoryMb: 4096,
          diskGb: 60,
          adminUsername: "cloudadmin",
          sshPublicKey: null,
          providerInstanceRef: null,
        },
      },
    ]);
    logAuditMock.mockResolvedValue(undefined);

    const response = await claimRoute.POST(
      new Request("https://cloud.uppoint.com.tr/api/internal/instances/provisioning/claim", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        claimed: 1,
        jobs: expect.arrayContaining([
          expect.objectContaining({ jobId: "job_1" }),
        ]),
      },
    });
    expect(claimProvisioningJobsMock).toHaveBeenCalledWith({
      workerId: "incus-worker-1",
      batchSize: 2,
      lockStaleSeconds: 180,
    });
    expect(logAuditMock).toHaveBeenCalledWith(
      "instance_provisioning_started",
      "unknown",
      "user_1",
      expect.objectContaining({
        requestId: "req_claim_success_1",
        targetId: "job_1",
      }),
      "tenant_1",
    );
  });
});

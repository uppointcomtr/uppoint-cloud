import { rm, stat } from "fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  assertInstanceTenantAccessMock,
  authMock,
  enforceIdentifierRateLimitMock,
  enforceIpRateLimitMock,
  logAuditMock,
  logServerErrorMock,
  resolveUserTenantContextMock,
  testUploadDir,
} = vi.hoisted(() => ({
  assertInstanceTenantAccessMock: vi.fn(),
  authMock: vi.fn(),
  enforceIdentifierRateLimitMock: vi.fn(),
  enforceIpRateLimitMock: vi.fn(),
  logAuditMock: vi.fn(),
  logServerErrorMock: vi.fn(),
  resolveUserTenantContextMock: vi.fn(),
  testUploadDir: "/tmp/uppoint-cloud-iso-route-test",
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/audit-log", () => ({
  logAudit: logAuditMock,
}));

vi.mock("@/lib/env", () => ({
  env: {
    INSTANCE_ISO_UPLOAD_DIR: testUploadDir,
    INSTANCE_ISO_UPLOAD_MAX_BYTES: 1024,
  },
}));

vi.mock("@/lib/observability/safe-server-error-log", () => ({
  logServerError: logServerErrorMock,
}));

vi.mock("@/lib/security/route-guard", () => ({
  enforceFailClosedIdentifierRateLimit: enforceIdentifierRateLimitMock,
  enforceFailClosedIpRateLimit: enforceIpRateLimitMock,
}));

vi.mock("@/modules/instances/server/security-boundary", () => ({
  assertInstanceTenantAccess: assertInstanceTenantAccessMock,
}));

vi.mock("@/modules/tenant/server/user-tenant", () => ({
  resolveUserTenantContext: resolveUserTenantContextMock,
}));

import * as isoUploadRoute from "@/app/api/instances/iso-images/route";

describe("instance ISO upload route", () => {
  beforeEach(async () => {
    await rm(testUploadDir, { recursive: true, force: true });

    authMock.mockReset();
    enforceIpRateLimitMock.mockReset();
    enforceIdentifierRateLimitMock.mockReset();
    logAuditMock.mockReset();
    logServerErrorMock.mockReset();
    resolveUserTenantContextMock.mockReset();
    assertInstanceTenantAccessMock.mockReset();

    authMock.mockResolvedValue({ user: { id: "user_1" } });
    enforceIpRateLimitMock.mockResolvedValue({ ip: "127.0.0.1", blockedResponse: null });
    enforceIdentifierRateLimitMock.mockResolvedValue(null);
    resolveUserTenantContextMock.mockResolvedValue({
      tenantId: "tenant_1",
      userId: "user_1",
      role: "ADMIN",
    });
    assertInstanceTenantAccessMock.mockResolvedValue({
      tenantId: "tenant_1",
      userId: "user_1",
      role: "ADMIN",
    });
    logAuditMock.mockResolvedValue(undefined);
  });

  it("requires tenant authorization before writing an ISO to disk", async () => {
    const response = await isoUploadRoute.POST(
      new Request("https://cloud.uppoint.com.tr/api/instances/iso-images", {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-file-name": encodeURIComponent("ubuntu.iso"),
          "x-tenant-id": "tenant_1",
        },
        body: new Blob(["iso-data"]),
      }),
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload).toMatchObject({
      success: true,
      data: {
        originalFileName: "ubuntu.iso",
        sizeBytes: 8,
      },
    });
    await expect(stat(payload.data.storagePath)).resolves.toMatchObject({ size: 8 });
    expect(resolveUserTenantContextMock).toHaveBeenCalledWith({
      userId: "user_1",
      tenantId: "tenant_1",
      minimumRole: "ADMIN",
    });
    expect(assertInstanceTenantAccessMock).toHaveBeenCalledWith({
      tenantId: "tenant_1",
      userId: "user_1",
      minimumRole: "ADMIN",
    });
    expect(logAuditMock).toHaveBeenCalledWith(
      "instance_iso_upload_completed",
      "127.0.0.1",
      "user_1",
      expect.objectContaining({
        result: "SUCCESS",
        sizeBytes: 8,
      }),
      "tenant_1",
    );
  });

  it("rejects unauthenticated uploads", async () => {
    authMock.mockResolvedValueOnce(null);

    const response = await isoUploadRoute.POST(
      new Request("https://cloud.uppoint.com.tr/api/instances/iso-images", {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-file-name": encodeURIComponent("ubuntu.iso"),
          "x-tenant-id": "tenant_1",
        },
        body: new Blob(["iso-data"]),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "UNAUTHORIZED",
      code: "UNAUTHORIZED",
    });
    expect(resolveUserTenantContextMock).not.toHaveBeenCalled();
    expect(assertInstanceTenantAccessMock).not.toHaveBeenCalled();
  });
});

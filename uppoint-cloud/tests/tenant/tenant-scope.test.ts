import { TenantRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const logAuditMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/lib/audit-log", () => ({
  logAudit: logAuditMock,
}));

import { assertTenantAccess } from "@/modules/tenant/server/scope";
import { hasRequiredTenantRole, hasTenantPermission } from "@/modules/tenant/server/permissions";

describe("tenant scope helpers", () => {
  beforeEach(() => {
    logAuditMock.mockClear();
  });

  it("checks role hierarchy correctly", () => {
    expect(hasRequiredTenantRole(TenantRole.OWNER, TenantRole.ADMIN)).toBe(true);
    expect(hasRequiredTenantRole(TenantRole.ADMIN, TenantRole.MEMBER)).toBe(true);
    expect(hasRequiredTenantRole(TenantRole.MEMBER, TenantRole.ADMIN)).toBe(false);
    expect(hasTenantPermission(TenantRole.ADMIN, "tenant:manage_members")).toBe(true);
    expect(hasTenantPermission(TenantRole.MEMBER, "tenant:manage_billing")).toBe(false);
  });

  it("grants access to active tenant membership", async () => {
    const result = await assertTenantAccess(
      { tenantId: "t1", userId: "u1", minimumRole: TenantRole.MEMBER },
      {
        findMembership: async () => ({
          tenantId: "t1",
          userId: "u1",
          role: TenantRole.ADMIN,
          tenant: { deletedAt: null },
        }),
      },
    );

    expect(result).toEqual({
      tenantId: "t1",
      userId: "u1",
      role: TenantRole.ADMIN,
    });
  });

  it("rejects users without required tenant role", async () => {
    await expect(
      assertTenantAccess(
        { tenantId: "t1", userId: "u1", minimumRole: TenantRole.OWNER },
        {
          findMembership: async () => ({
            tenantId: "t1",
            userId: "u1",
            role: TenantRole.ADMIN,
            tenant: { deletedAt: null },
          }),
        },
      ),
    ).rejects.toThrow("TENANT_ROLE_INSUFFICIENT");
  });

  it("propagates explicit audit context on denied tenant access", async () => {
    await expect(
      assertTenantAccess(
        {
          tenantId: "t-denied",
          userId: "u-denied",
          minimumRole: TenantRole.MEMBER,
          auditContext: {
            ip: "203.0.113.10",
            requestId: "req-tenant-denied-1",
            userAgent: "vitest-agent",
            forwardedFor: "203.0.113.10",
          },
        },
        {
          findMembership: async () => null,
        },
      ),
    ).rejects.toThrow("TENANT_ACCESS_DENIED");

    expect(logAuditMock).toHaveBeenCalledWith(
      "tenant_access_denied",
      "203.0.113.10",
      "u-denied",
      expect.objectContaining({
        requestId: "req-tenant-denied-1",
        userAgent: "vitest-agent",
        forwardedFor: "203.0.113.10",
      }),
      "t-denied",
    );
  });
});

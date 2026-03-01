import { TenantRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

const logAuditMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/lib/audit-log", () => ({
  logAudit: logAuditMock,
}));

import { assertTenantAccess, hasRequiredTenantRole } from "@/modules/tenant/server/scope";

describe("tenant scope helpers", () => {
  it("checks role hierarchy correctly", () => {
    expect(hasRequiredTenantRole(TenantRole.OWNER, TenantRole.ADMIN)).toBe(true);
    expect(hasRequiredTenantRole(TenantRole.ADMIN, TenantRole.MEMBER)).toBe(true);
    expect(hasRequiredTenantRole(TenantRole.MEMBER, TenantRole.ADMIN)).toBe(false);
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
});

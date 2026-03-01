import { TenantRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  resolveUserTenantContext,
  UserTenantContextError,
} from "@/modules/tenant/server/user-tenant";

describe("resolveUserTenantContext", () => {
  it("returns first active membership when tenantId is not provided", async () => {
    const context = await resolveUserTenantContext(
      { userId: "u1" },
      {
        findFirstMembership: vi.fn().mockResolvedValue({
          tenantId: "t1",
          role: TenantRole.ADMIN,
        }),
        findMembershipByTenant: vi.fn().mockResolvedValue({
          tenantId: "t1",
          role: TenantRole.ADMIN,
        }),
        createBootstrapTenant: vi.fn(),
        assertAccess: vi.fn(),
      },
    );

    expect(context).toEqual({
      tenantId: "t1",
      role: TenantRole.ADMIN,
    });
  });

  it("creates bootstrap tenant membership when user has none", async () => {
    const createBootstrapTenant = vi.fn().mockResolvedValue({
      tenantId: "new-tenant",
      role: TenantRole.OWNER,
    });

    const context = await resolveUserTenantContext(
      { userId: "u2" },
      {
        findFirstMembership: vi.fn().mockResolvedValue(null),
        findMembershipByTenant: vi.fn(),
        createBootstrapTenant,
        assertAccess: vi.fn(),
      },
    );

    expect(createBootstrapTenant).toHaveBeenCalledWith("u2");
    expect(context).toEqual({
      tenantId: "new-tenant",
      role: TenantRole.OWNER,
    });
  });

  it("throws TENANT_ACCESS_DENIED when explicit tenant access fails", async () => {
    await expect(
      resolveUserTenantContext(
        {
          userId: "u3",
          tenantId: "t3",
          minimumRole: TenantRole.ADMIN,
        },
        {
          findFirstMembership: vi.fn(),
          findMembershipByTenant: vi.fn(),
          createBootstrapTenant: vi.fn(),
          assertAccess: vi.fn().mockRejectedValue(new Error("denied")),
        },
      ),
    ).rejects.toMatchObject({
      code: "TENANT_ACCESS_DENIED",
    } satisfies Partial<UserTenantContextError>);
  });
});

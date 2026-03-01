import { TenantRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  resolveUserTenantContext,
  UserTenantContextError,
} from "@/modules/tenant/server/user-tenant";

describe("resolveUserTenantContext", () => {
  it("returns membership when exactly one active tenant exists and tenantId is not provided", async () => {
    const context = await resolveUserTenantContext(
      { userId: "u1" },
      {
        findMemberships: vi.fn().mockResolvedValue([{
          tenantId: "t1",
          role: TenantRole.ADMIN,
        }]),
        assertAccess: vi.fn().mockResolvedValue({
          tenantId: "t1",
          role: TenantRole.ADMIN,
        }),
      },
    );

    expect(context).toEqual({
      tenantId: "t1",
      role: TenantRole.ADMIN,
    });
  });

  it("throws TENANT_NOT_FOUND when user has no active tenant membership", async () => {
    await expect(
      resolveUserTenantContext(
        { userId: "u2" },
        {
          findMemberships: vi.fn().mockResolvedValue([]),
          assertAccess: vi.fn(),
        },
      ),
    ).rejects.toMatchObject({
      code: "TENANT_NOT_FOUND",
    } satisfies Partial<UserTenantContextError>);
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
          findMemberships: vi.fn(),
          assertAccess: vi.fn().mockRejectedValue(new Error("denied")),
        },
      ),
    ).rejects.toMatchObject({
      code: "TENANT_ACCESS_DENIED",
    } satisfies Partial<UserTenantContextError>);
  });

  it("throws TENANT_SELECTION_REQUIRED when user belongs to multiple tenants and no tenantId is provided", async () => {
    await expect(
      resolveUserTenantContext(
        { userId: "u4" },
        {
          findMemberships: vi.fn().mockResolvedValue([
            { tenantId: "t1", role: TenantRole.MEMBER },
            { tenantId: "t2", role: TenantRole.ADMIN },
          ]),
          assertAccess: vi.fn(),
        },
      ),
    ).rejects.toMatchObject({
      code: "TENANT_SELECTION_REQUIRED",
    } satisfies Partial<UserTenantContextError>);
  });
});

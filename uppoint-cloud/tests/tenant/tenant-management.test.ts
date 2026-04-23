import { describe, expect, it, vi } from "vitest";
import { TenantRole } from "@prisma/client";

import {
  createTenantForUser,
  deleteTenantForUser,
  getTenantManagementDetailForUser,
  TenantManagementError,
} from "@/modules/tenant/server/tenant-management";

function createSlugConflictError() {
  return {
    code: "P2002",
    meta: {
      target: ["slug"],
    },
  };
}

describe("tenant management service", () => {
  it("creates tenant with normalized slug candidate", async () => {
    const createTenant = vi.fn().mockResolvedValue({
      id: "tenant_1",
      slug: "acme-cloud-a1b2c3d4",
      name: "Acme Cloud",
    });

    const result = await createTenantForUser(
      {
        userId: "user_1",
        name: "  Acme Cloud  ",
      },
      {
        createTenant,
        createSlugSuffix: vi.fn(() => "a1b2c3d4"),
      },
    );

    expect(result).toEqual({
      id: "tenant_1",
      slug: "acme-cloud-a1b2c3d4",
      name: "Acme Cloud",
    });
    expect(createTenant).toHaveBeenCalledWith({
      userId: "user_1",
      name: "Acme Cloud",
      slug: "acme-cloud-a1b2c3d4",
    });
  });

  it("retries tenant creation when slug collision occurs", async () => {
    const createTenant = vi.fn()
      .mockRejectedValueOnce(createSlugConflictError())
      .mockResolvedValueOnce({
        id: "tenant_2",
        slug: "acme-cloud-beefcafe",
        name: "Acme Cloud",
      });

    const createSlugSuffix = vi
      .fn()
      .mockReturnValueOnce("deadbeef")
      .mockReturnValueOnce("beefcafe");

    const result = await createTenantForUser(
      {
        userId: "user_2",
        name: "Acme Cloud",
      },
      {
        createTenant,
        createSlugSuffix,
      },
    );

    expect(result.id).toBe("tenant_2");
    expect(createTenant).toHaveBeenCalledTimes(2);
    expect(createSlugSuffix).toHaveBeenCalledTimes(2);
  });

  it("fails after slug collision retry budget is exhausted", async () => {
    const createTenant = vi.fn().mockRejectedValue(createSlugConflictError());

    await expect(
      createTenantForUser(
        {
          userId: "user_3",
          name: "Acme Cloud",
        },
        {
          createTenant,
          createSlugSuffix: vi.fn(() => "cafefeed"),
        },
      ),
    ).rejects.toMatchObject({
      code: "TENANT_SLUG_RETRY_EXHAUSTED",
    } satisfies Partial<TenantManagementError>);

    expect(createTenant).toHaveBeenCalledTimes(5);
  });

  it("fails closed on non-collision repository errors", async () => {
    const createTenant = vi.fn().mockRejectedValue(new Error("database-down"));

    await expect(
      createTenantForUser(
        {
          userId: "user_4",
          name: "Acme Cloud",
        },
        {
          createTenant,
          createSlugSuffix: vi.fn(() => "feedbabe"),
        },
      ),
    ).rejects.toMatchObject({
      code: "TENANT_CREATE_FAILED",
    } satisfies Partial<TenantManagementError>);
  });

  it("returns tenant detail with permissions and delete eligibility", async () => {
    const result = await getTenantManagementDetailForUser(
      {
        userId: "user_1",
        tenantId: "tenant_1",
      },
      {
        assertAccess: vi.fn().mockResolvedValue({
          tenantId: "tenant_1",
          role: TenantRole.OWNER,
        }),
        listResourceGroups: vi.fn().mockResolvedValue([]),
      },
    );

    expect(result).toMatchObject({
      tenantId: "tenant_1",
      role: TenantRole.OWNER,
      canDelete: true,
      deleteBlockedReason: null,
      permissions: [
        "tenant:read",
        "tenant:manage_members",
        "tenant:manage_infrastructure",
        "tenant:manage_billing",
      ],
    });
  });

  it("blocks tenant detail access when membership cannot be verified", async () => {
    await expect(
      getTenantManagementDetailForUser(
        {
          userId: "user_1",
          tenantId: "tenant_1",
        },
        {
          assertAccess: vi.fn().mockRejectedValue(new Error("TENANT_ACCESS_DENIED")),
          listResourceGroups: vi.fn(),
        },
      ),
    ).rejects.toMatchObject({
      code: "TENANT_DETAIL_ACCESS_DENIED",
    } satisfies Partial<TenantManagementError>);
  });

  it("cancels tenant when owner role has no attached resource groups", async () => {
    const softDeleteTenant = vi.fn().mockResolvedValue(undefined);
    const result = await deleteTenantForUser(
      {
        userId: "user_1",
        tenantId: "tenant_1",
      },
      {
        assertAccess: vi.fn().mockResolvedValue({
          tenantId: "tenant_1",
          role: TenantRole.OWNER,
        }),
        listResourceGroups: vi.fn().mockResolvedValue([]),
        softDeleteTenant,
        listMemberships: vi.fn().mockResolvedValue([
          { tenantId: "tenant_2", role: TenantRole.OWNER },
        ]),
        now: () => new Date("2026-04-22T10:00:00.000Z"),
      },
    );

    expect(result).toEqual({
      deletedTenantId: "tenant_1",
      nextTenantId: "tenant_2",
    });
    expect(softDeleteTenant).toHaveBeenCalledTimes(1);
  });

  it("blocks tenant cancel when requester is not owner", async () => {
    await expect(
      deleteTenantForUser(
        {
          userId: "user_1",
          tenantId: "tenant_1",
        },
        {
          assertAccess: vi.fn().mockResolvedValue({
            tenantId: "tenant_1",
            role: TenantRole.ADMIN,
          }),
          listResourceGroups: vi.fn().mockResolvedValue([]),
          softDeleteTenant: vi.fn().mockResolvedValue(undefined),
          listMemberships: vi.fn().mockResolvedValue([]),
          now: () => new Date(),
        },
      ),
    ).rejects.toMatchObject({
      code: "TENANT_DELETE_FORBIDDEN_ROLE",
    } satisfies Partial<TenantManagementError>);
  });

  it("blocks tenant cancel when active resource groups are attached", async () => {
    await expect(
      deleteTenantForUser(
        {
          userId: "user_1",
          tenantId: "tenant_1",
        },
        {
          assertAccess: vi.fn().mockResolvedValue({
            tenantId: "tenant_1",
            role: TenantRole.OWNER,
          }),
          listResourceGroups: vi.fn().mockResolvedValue([
            {
              id: "rg_1",
              tenantId: "tenant_1",
              name: "Primary",
              slug: "primary",
              regionCode: "tr-ist-1",
              createdAt: new Date("2026-04-14T12:00:00.000Z"),
              updatedAt: new Date("2026-04-14T12:00:00.000Z"),
            },
          ]),
          softDeleteTenant: vi.fn().mockResolvedValue(undefined),
          listMemberships: vi.fn().mockResolvedValue([]),
          now: () => new Date(),
        },
      ),
    ).rejects.toMatchObject({
      code: "TENANT_DELETE_BLOCKED_RESOURCE_GROUPS",
    } satisfies Partial<TenantManagementError>);
  });
});

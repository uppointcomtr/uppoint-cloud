import { describe, expect, it, vi } from "vitest";

import {
  createTenantForUser,
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
});


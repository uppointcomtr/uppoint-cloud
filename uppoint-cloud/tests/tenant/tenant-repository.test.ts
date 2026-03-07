import { describe, expect, it, vi } from "vitest";

import {
  ensureDefaultTenantMembershipForUser,
  findUserTenantIds,
} from "@/db/repositories/tenant-repository";

describe("tenant repository", () => {
  it("filters soft-deleted tenants in findUserTenantIds", async () => {
    const findMany = vi.fn(async () => [{ tenantId: "tenant_1" }]);
    const client = {
      tenantMembership: {
        findMany,
      },
    } as unknown as Parameters<typeof findUserTenantIds>[1];

    const tenantIds = await findUserTenantIds({ userId: "user_1" }, client);

    expect(tenantIds).toEqual(["tenant_1"]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        tenant: {
          deletedAt: null,
        },
      },
      select: { tenantId: true },
    });
  });

  it("repairs default tenant membership when user has no active tenant", async () => {
    const executeRaw = vi.fn().mockResolvedValue(undefined);
    const findFirst = vi.fn().mockResolvedValue(null);
    const findUnique = vi.fn().mockResolvedValue(null);
    const createTenant = vi.fn().mockResolvedValue({ id: "tenant_new" });
    const upsertMembership = vi.fn().mockResolvedValue({ id: "membership_new" });

    const tx = {
      $executeRaw: executeRaw,
      tenantMembership: {
        findFirst,
        upsert: upsertMembership,
      },
      tenant: {
        findUnique,
        create: createTenant,
      },
    };

    const client = {
      $transaction: async (callback: (transactionClient: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as Parameters<typeof ensureDefaultTenantMembershipForUser>[1];

    const result = await ensureDefaultTenantMembershipForUser(
      { userId: "user_123", now: new Date("2026-03-07T00:00:00.000Z") },
      client,
    );

    expect(result).toEqual({
      tenantId: "tenant_new",
      role: "OWNER",
      repaired: true,
    });
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        slug: "usr-user_123",
      },
      select: {
        id: true,
        deletedAt: true,
      },
    });
    expect(createTenant).toHaveBeenCalledWith({
      data: {
        slug: "usr-user_123",
        name: "Workspace er_123",
      },
      select: {
        id: true,
      },
    });
    expect(upsertMembership).toHaveBeenCalledTimes(1);
  });
});

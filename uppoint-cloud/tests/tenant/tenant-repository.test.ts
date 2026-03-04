import { describe, expect, it, vi } from "vitest";

import { findUserTenantIds } from "@/db/repositories/tenant-repository";

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
});

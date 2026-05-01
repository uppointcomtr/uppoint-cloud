import { TenantRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { getInstanceResourceGroupHierarchy } from "@/modules/instances/server/resource-group-hierarchy";

describe("getInstanceResourceGroupHierarchy", () => {
  it("authorizes tenant membership before loading the hierarchy", async () => {
    const generatedAt = new Date("2026-05-01T10:00:00.000Z");
    const assertAccess = vi.fn().mockResolvedValue({
      tenantId: "tenant_1",
      userId: "user_1",
      role: TenantRole.MEMBER,
    });
    const listHierarchy = vi.fn().mockResolvedValue([]);

    const result = await getInstanceResourceGroupHierarchy(
      {
        tenantId: "tenant_1",
        userId: "user_1",
      },
      {
        assertAccess,
        listHierarchy,
        now: () => generatedAt,
      },
    );

    expect(assertAccess).toHaveBeenCalledWith({
      tenantId: "tenant_1",
      userId: "user_1",
      minimumRole: TenantRole.MEMBER,
    });
    expect(listHierarchy).toHaveBeenCalledWith({
      tenantId: "tenant_1",
    });
    expect(result).toEqual({
      tenantId: "tenant_1",
      generatedAt,
      resourceGroups: [],
    });
  });
});

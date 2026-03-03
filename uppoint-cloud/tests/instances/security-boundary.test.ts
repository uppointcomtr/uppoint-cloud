import { TenantRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const assertTenantAccessMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/tenant/server/scope", () => ({
  assertTenantAccess: assertTenantAccessMock,
}));

import { assertInstanceTenantAccess } from "@/modules/instances/server/security-boundary";

describe("assertInstanceTenantAccess", () => {
  beforeEach(() => {
    assertTenantAccessMock.mockReset();
    assertTenantAccessMock.mockResolvedValue({
      tenantId: "tenant_1",
      userId: "user_1",
      role: TenantRole.ADMIN,
    });
  });

  it("defaults to ADMIN role for instance operations", async () => {
    await assertInstanceTenantAccess({
      tenantId: "tenant_1",
      userId: "user_1",
    });

    expect(assertTenantAccessMock).toHaveBeenCalledWith({
      tenantId: "tenant_1",
      userId: "user_1",
      minimumRole: TenantRole.ADMIN,
    });
  });

  it("respects stricter minimum role requirements", async () => {
    await assertInstanceTenantAccess({
      tenantId: "tenant_1",
      userId: "user_1",
      minimumRole: TenantRole.OWNER,
    });

    expect(assertTenantAccessMock).toHaveBeenCalledWith({
      tenantId: "tenant_1",
      userId: "user_1",
      minimumRole: TenantRole.OWNER,
    });
  });
});

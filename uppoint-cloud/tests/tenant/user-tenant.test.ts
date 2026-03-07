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
          ensureDefaultMembership: vi.fn(),
          now: vi.fn(() => new Date("2026-03-07T00:00:00.000Z")),
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
          ensureDefaultMembership: vi.fn().mockRejectedValue(new Error("repair-failed")),
          now: vi.fn(() => new Date("2026-03-07T00:00:00.000Z")),
        },
      ),
    ).rejects.toMatchObject({
      code: "TENANT_NOT_FOUND",
    } satisfies Partial<UserTenantContextError>);
  });

  it("repairs tenant boundary for legacy users without active memberships", async () => {
    const context = await resolveUserTenantContext(
      { userId: "u2" },
      {
        findMemberships: vi.fn().mockResolvedValue([]),
        ensureDefaultMembership: vi.fn().mockResolvedValue({
          tenantId: "tenant_repaired",
          role: TenantRole.OWNER,
        }),
        assertAccess: vi.fn().mockResolvedValue({
          tenantId: "tenant_repaired",
          role: TenantRole.OWNER,
        }),
        now: vi.fn(() => new Date("2026-03-07T00:00:00.000Z")),
      },
    );

    expect(context).toEqual({
      tenantId: "tenant_repaired",
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
          findMemberships: vi.fn(),
          assertAccess: vi.fn().mockRejectedValue(new Error("denied")),
          ensureDefaultMembership: vi.fn(),
          now: vi.fn(() => new Date("2026-03-07T00:00:00.000Z")),
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
          ensureDefaultMembership: vi.fn(),
          now: vi.fn(() => new Date("2026-03-07T00:00:00.000Z")),
        },
      ),
    ).rejects.toMatchObject({
      code: "TENANT_SELECTION_REQUIRED",
    } satisfies Partial<UserTenantContextError>);
  });
});

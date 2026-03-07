import "server-only";

import { TenantRole } from "@prisma/client";

import {
  ensureDefaultTenantMembershipForUser,
  findUserTenantMembershipsForContext,
} from "@/db/repositories/tenant-repository";
import { assertTenantAccess } from "@/modules/tenant/server/scope";

interface ResolveUserTenantDependencies {
  findMemberships: (userId: string) => Promise<Array<{ tenantId: string; role: TenantRole }>>;
  assertAccess: (input: { tenantId: string; userId: string; minimumRole: TenantRole }) => Promise<{ tenantId: string; role: TenantRole }>;
  ensureDefaultMembership: (input: { userId: string; now: Date }) => Promise<{ tenantId: string; role: TenantRole }>;
  now: () => Date;
}

const defaultDependencies: ResolveUserTenantDependencies = {
  findMemberships: async (userId) =>
    findUserTenantMembershipsForContext({
      userId,
      take: 2,
    }),
  assertAccess: async ({ tenantId, userId, minimumRole }) => assertTenantAccess({ tenantId, userId, minimumRole }),
  ensureDefaultMembership: async ({ userId, now }) => {
    const repaired = await ensureDefaultTenantMembershipForUser({ userId, now });
    return {
      tenantId: repaired.tenantId,
      role: repaired.role,
    };
  },
  now: () => new Date(),
};

export class UserTenantContextError extends Error {
  constructor(
    public readonly code: "TENANT_NOT_FOUND" | "TENANT_ACCESS_DENIED" | "TENANT_SELECTION_REQUIRED",
  ) {
    super(code);
    this.name = "UserTenantContextError";
  }
}

export async function resolveUserTenantContext(
  input: { userId: string; tenantId?: string; minimumRole?: TenantRole },
  dependencies: ResolveUserTenantDependencies = defaultDependencies,
): Promise<{ tenantId: string; role: TenantRole }> {
  if (input.tenantId) {
    try {
      const access = await dependencies.assertAccess({
        tenantId: input.tenantId,
        userId: input.userId,
        minimumRole: input.minimumRole ?? TenantRole.MEMBER,
      });

      return {
        tenantId: access.tenantId,
        role: access.role,
      };
    } catch {
      throw new UserTenantContextError("TENANT_ACCESS_DENIED");
    }
  }

  const memberships = await dependencies.findMemberships(input.userId);

  if (memberships.length === 0) {
    // Security-sensitive: legacy users without membership are repaired into an isolated default tenant boundary.
    try {
      const repaired = await dependencies.ensureDefaultMembership({
        userId: input.userId,
        now: dependencies.now(),
      });

      await dependencies.assertAccess({
        tenantId: repaired.tenantId,
        userId: input.userId,
        minimumRole: input.minimumRole ?? TenantRole.MEMBER,
      });

      return {
        tenantId: repaired.tenantId,
        role: repaired.role,
      };
    } catch {
      throw new UserTenantContextError("TENANT_NOT_FOUND");
    }
  }

  if (memberships.length > 1) {
    // Security-sensitive: force explicit tenant selection when multiple memberships exist.
    throw new UserTenantContextError("TENANT_SELECTION_REQUIRED");
  }

  const membership = memberships[0]!;

  try {
    await dependencies.assertAccess({
      tenantId: membership.tenantId,
      userId: input.userId,
      minimumRole: input.minimumRole ?? TenantRole.MEMBER,
    });
  } catch {
    throw new UserTenantContextError("TENANT_ACCESS_DENIED");
  }

  return {
    tenantId: membership.tenantId,
    role: membership.role,
  };
}

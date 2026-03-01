import "server-only";

import { TenantRole } from "@prisma/client";

import { prisma } from "@/db/client";
import { assertTenantAccess } from "@/modules/tenant/server/scope";

interface ResolveUserTenantDependencies {
  findMemberships: (userId: string) => Promise<Array<{ tenantId: string; role: TenantRole }>>;
  assertAccess: (input: { tenantId: string; userId: string; minimumRole: TenantRole }) => Promise<{ tenantId: string; role: TenantRole }>;
}

const defaultDependencies: ResolveUserTenantDependencies = {
  findMemberships: async (userId) =>
    prisma.tenantMembership.findMany({
      where: {
        userId,
        tenant: {
          deletedAt: null,
        },
      },
      orderBy: { createdAt: "asc" },
      take: 2,
      select: {
        tenantId: true,
        role: true,
      },
    }),
  assertAccess: async ({ tenantId, userId, minimumRole }) => assertTenantAccess({ tenantId, userId, minimumRole }),
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
    throw new UserTenantContextError("TENANT_NOT_FOUND");
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

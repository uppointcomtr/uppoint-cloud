import "server-only";

import { TenantRole } from "@prisma/client";

import { prisma } from "@/db/client";
import { assertTenantAccess } from "@/modules/tenant/server/scope";

interface ResolveUserTenantDependencies {
  findFirstMembership: (userId: string) => Promise<{ tenantId: string; role: TenantRole } | null>;
  findMembershipByTenant: (input: { userId: string; tenantId: string }) => Promise<{ tenantId: string; role: TenantRole } | null>;
  assertAccess: (input: { tenantId: string; userId: string; minimumRole: TenantRole }) => Promise<{ tenantId: string; role: TenantRole }>;
}

const defaultDependencies: ResolveUserTenantDependencies = {
  findFirstMembership: async (userId) =>
    prisma.tenantMembership.findFirst({
      where: {
        userId,
        tenant: {
          deletedAt: null,
        },
      },
      orderBy: { createdAt: "asc" },
      select: {
        tenantId: true,
        role: true,
      },
    }),
  findMembershipByTenant: async ({ userId, tenantId }) =>
    prisma.tenantMembership.findFirst({
      where: {
        userId,
        tenantId,
        tenant: {
          deletedAt: null,
        },
      },
      select: {
        tenantId: true,
        role: true,
      },
    }),
  assertAccess: async ({ tenantId, userId, minimumRole }) => assertTenantAccess({ tenantId, userId, minimumRole }),
};

export class UserTenantContextError extends Error {
  constructor(public readonly code: "TENANT_NOT_FOUND" | "TENANT_ACCESS_DENIED") {
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

  const firstMembership = await dependencies.findFirstMembership(input.userId);

  if (!firstMembership) {
    throw new UserTenantContextError("TENANT_NOT_FOUND");
  }

  const membership = await dependencies.findMembershipByTenant({
    userId: input.userId,
    tenantId: firstMembership.tenantId,
  });

  if (!membership) {
    throw new UserTenantContextError("TENANT_ACCESS_DENIED");
  }

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

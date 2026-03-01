import "server-only";

import { TenantRole } from "@prisma/client";

import { prisma } from "@/db/client";
import { assertTenantAccess } from "@/modules/tenant/server/scope";

interface ResolveUserTenantDependencies {
  findFirstMembership: (userId: string) => Promise<{ tenantId: string; role: TenantRole } | null>;
  findMembershipByTenant: (input: { userId: string; tenantId: string }) => Promise<{ tenantId: string; role: TenantRole } | null>;
  createBootstrapTenant: (userId: string) => Promise<{ tenantId: string; role: TenantRole }>;
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
  createBootstrapTenant: async (userId) =>
    prisma.$transaction(async (tx) => {
      const existingMembership = await tx.tenantMembership.findFirst({
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
      });

      if (existingMembership) {
        return {
          tenantId: existingMembership.tenantId,
          role: existingMembership.role,
        };
      }

      const tenant = await tx.tenant.create({
        data: {
          slug: `usr-${userId}`,
          name: `Workspace ${userId.slice(-6)}`,
        },
        select: {
          id: true,
        },
      });

      const membership = await tx.tenantMembership.create({
        data: {
          tenantId: tenant.id,
          userId,
          role: TenantRole.OWNER,
        },
        select: {
          tenantId: true,
          role: true,
        },
      });

      return {
        tenantId: membership.tenantId,
        role: membership.role,
      };
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
    const bootstrapMembership = await dependencies.createBootstrapTenant(input.userId);
    return bootstrapMembership;
  }

  const membership = await dependencies.findMembershipByTenant({
    userId: input.userId,
    tenantId: firstMembership.tenantId,
  });

  if (!membership) {
    throw new UserTenantContextError("TENANT_ACCESS_DENIED");
  }

  if (input.minimumRole) {
    try {
      await dependencies.assertAccess({
        tenantId: membership.tenantId,
        userId: input.userId,
        minimumRole: input.minimumRole,
      });
    } catch {
      throw new UserTenantContextError("TENANT_ACCESS_DENIED");
    }
  }

  return {
    tenantId: membership.tenantId,
    role: membership.role,
  };
}

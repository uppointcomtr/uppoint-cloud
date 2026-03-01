import "server-only";

import { TenantRole } from "@prisma/client";

import { prisma } from "@/db/client";

const roleRank: Record<TenantRole, number> = {
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

interface TenantScopeDependencies {
  findMembership: (input: { tenantId: string; userId: string }) => Promise<{
    tenantId: string;
    userId: string;
    role: TenantRole;
    tenant: {
      deletedAt: Date | null;
    };
  } | null>;
}

const defaultDependencies: TenantScopeDependencies = {
  findMembership: async ({ tenantId, userId }) =>
    prisma.tenantMembership.findUnique({
      where: {
        tenantId_userId: {
          tenantId,
          userId,
        },
      },
      select: {
        tenantId: true,
        userId: true,
        role: true,
        tenant: {
          select: {
            deletedAt: true,
          },
        },
      },
    }),
};

export function hasRequiredTenantRole(role: TenantRole, minimumRole: TenantRole): boolean {
  return roleRank[role] >= roleRank[minimumRole];
}

export async function assertTenantAccess(
  input: { tenantId: string; userId: string; minimumRole?: TenantRole },
  dependencies: TenantScopeDependencies = defaultDependencies,
): Promise<{ tenantId: string; userId: string; role: TenantRole }> {
  const membership = await dependencies.findMembership({
    tenantId: input.tenantId,
    userId: input.userId,
  });

  if (!membership || membership.tenant.deletedAt) {
    throw new Error("TENANT_ACCESS_DENIED");
  }

  const minimumRole = input.minimumRole ?? TenantRole.MEMBER;

  if (!hasRequiredTenantRole(membership.role, minimumRole)) {
    throw new Error("TENANT_ROLE_INSUFFICIENT");
  }

  return {
    tenantId: membership.tenantId,
    userId: membership.userId,
    role: membership.role,
  };
}

import "server-only";

import type { Prisma, TenantRole } from "@prisma/client";

import { prisma } from "@/db/client";

type TenantRepositoryClient = Prisma.TransactionClient | typeof prisma;

export async function findTenantMembershipForAccess(
  input: { tenantId: string; userId: string },
  client: TenantRepositoryClient = prisma,
): Promise<{
  tenantId: string;
  userId: string;
  role: TenantRole;
  tenant: {
    deletedAt: Date | null;
  };
} | null> {
  return client.tenantMembership.findUnique({
    where: {
      tenantId_userId: {
        tenantId: input.tenantId,
        userId: input.userId,
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
  });
}

export async function findUserTenantMembershipsForContext(
  input: { userId: string; take?: number },
  client: TenantRepositoryClient = prisma,
): Promise<Array<{ tenantId: string; role: TenantRole }>> {
  return client.tenantMembership.findMany({
    where: {
      userId: input.userId,
      tenant: {
        deletedAt: null,
      },
    },
    orderBy: { createdAt: "asc" },
    take: input.take ?? 2,
    select: {
      tenantId: true,
      role: true,
    },
  });
}

export async function findUserTenantIds(
  input: { userId: string },
  client: TenantRepositoryClient = prisma,
): Promise<string[]> {
  const memberships = await client.tenantMembership.findMany({
    where: { userId: input.userId },
    select: { tenantId: true },
  });

  return memberships.map((membership) => membership.tenantId);
}

export async function deleteUserTenantMemberships(
  input: { userId: string },
  client: TenantRepositoryClient = prisma,
): Promise<void> {
  await client.tenantMembership.deleteMany({
    where: { userId: input.userId },
  });
}

export async function countActiveTenantMembers(
  input: { tenantId: string },
  client: TenantRepositoryClient = prisma,
): Promise<number> {
  return client.tenantMembership.count({
    where: {
      tenantId: input.tenantId,
      user: {
        deletedAt: null,
      },
    },
  });
}

export async function softDeleteTenantIfActive(
  input: { tenantId: string; now: Date },
  client: TenantRepositoryClient = prisma,
): Promise<void> {
  await client.tenant.updateMany({
    where: {
      id: input.tenantId,
      deletedAt: null,
    },
    data: {
      deletedAt: input.now,
    },
  });
}

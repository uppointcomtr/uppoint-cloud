import "server-only";

import { TenantRole } from "@prisma/client";
import type { Prisma } from "@prisma/client";

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
    where: {
      userId: input.userId,
      tenant: {
        deletedAt: null,
      },
    },
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

export async function provisionDefaultTenantForUser(
  input: { userId: string; slug: string; name: string },
  client: TenantRepositoryClient = prisma,
): Promise<{ id: string }> {
  const tenant = await client.tenant.create({
    data: {
      slug: input.slug,
      name: input.name,
    },
    select: {
      id: true,
    },
  });

  await client.tenantMembership.create({
    data: {
      tenantId: tenant.id,
      userId: input.userId,
      role: TenantRole.OWNER,
    },
  });

  return tenant;
}

export async function ensureDefaultTenantMembershipForUser(
  input: { userId: string; now: Date },
  client: typeof prisma = prisma,
): Promise<{ tenantId: string; role: TenantRole; repaired: boolean }> {
  return client.$transaction(async (tx) => {
    // Security-sensitive: serialize per-user tenant boundary repair to avoid concurrent duplicate tenant creation.
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(CAST(hashtext(${input.userId}) AS bigint))
    `;

    const activeMembership = await tx.tenantMembership.findFirst({
      where: {
        userId: input.userId,
        tenant: {
          deletedAt: null,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        tenantId: true,
        role: true,
      },
    });

    if (activeMembership) {
      return {
        tenantId: activeMembership.tenantId,
        role: activeMembership.role,
        repaired: false,
      };
    }

    const defaultSlug = `usr-${input.userId}`;
    const defaultName = `Workspace ${input.userId.slice(-6)}`;

    const existingTenant = await tx.tenant.findUnique({
      where: {
        slug: defaultSlug,
      },
      select: {
        id: true,
        deletedAt: true,
      },
    });

    let tenantId: string;

    if (existingTenant) {
      tenantId = existingTenant.id;
      if (existingTenant.deletedAt) {
        await tx.tenant.update({
          where: {
            id: existingTenant.id,
          },
          data: {
            deletedAt: null,
            name: defaultName,
          },
        });
      }
    } else {
      const tenant = await tx.tenant.create({
        data: {
          slug: defaultSlug,
          name: defaultName,
        },
        select: {
          id: true,
        },
      });

      tenantId = tenant.id;
    }

    await tx.tenantMembership.upsert({
      where: {
        tenantId_userId: {
          tenantId,
          userId: input.userId,
        },
      },
      update: {
        role: TenantRole.OWNER,
      },
      create: {
        tenantId,
        userId: input.userId,
        role: TenantRole.OWNER,
      },
    });

    return {
      tenantId,
      role: TenantRole.OWNER,
      repaired: true,
    };
  });
}

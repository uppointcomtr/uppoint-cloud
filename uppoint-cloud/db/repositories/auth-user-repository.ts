import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/db/client";
import {
  countActiveTenantMembers,
  deleteUserTenantMemberships,
  findUserTenantIds,
  softDeleteTenantIfActive,
} from "@/db/repositories/tenant-repository";

type AuthUserRepositoryClient = Prisma.TransactionClient | typeof prisma;

async function softDeleteUserWithCleanupInTransaction(
  input: { userId: string; now: Date; tombstoneEmail: string },
  client: AuthUserRepositoryClient,
): Promise<boolean> {
  const updated = await client.user.updateMany({
    where: {
      id: input.userId,
      deletedAt: null,
    },
    data: {
      email: input.tombstoneEmail,
      phone: null,
      name: null,
      deletedAt: input.now,
      tokenVersion: {
        increment: 1,
      },
    },
  });

  if (updated.count !== 1) {
    return false;
  }

  await client.session.deleteMany({ where: { userId: input.userId } });
  await client.loginChallenge.deleteMany({ where: { userId: input.userId } });
  await client.passwordResetChallenge.deleteMany({ where: { userId: input.userId } });
  await client.accountDeleteChallenge.deleteMany({ where: { userId: input.userId } });
  await client.accountContactChangeChallenge.deleteMany({ where: { userId: input.userId } });
  await client.passwordResetToken.deleteMany({ where: { userId: input.userId } });
  await client.registrationVerificationChallenge.deleteMany({ where: { userId: input.userId } });

  const memberships = await findUserTenantIds({ userId: input.userId }, client);

  if (memberships.length > 0) {
    await deleteUserTenantMemberships({ userId: input.userId }, client);

    const tenantIds = [...new Set(memberships)];
    for (const tenantId of tenantIds) {
      const remainingActiveMembers = await countActiveTenantMembers({ tenantId }, client);

      if (remainingActiveMembers === 0) {
        await softDeleteTenantIfActive({ tenantId, now: input.now }, client);
      }
    }
  }

  return true;
}

export async function softDeleteUserWithCleanup(
  input: { userId: string; now: Date; tombstoneEmail: string },
  client: AuthUserRepositoryClient = prisma,
): Promise<boolean> {
  if ("$transaction" in client && typeof client.$transaction === "function") {
    return client.$transaction(async (tx) => softDeleteUserWithCleanupInTransaction(input, tx));
  }

  return softDeleteUserWithCleanupInTransaction(input, client);
}

export async function revokeAllUserSessions(
  input: { userId: string },
  client: typeof prisma = prisma,
): Promise<boolean> {
  return client.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: {
        id: input.userId,
        deletedAt: null,
      },
      data: {
        tokenVersion: {
          increment: 1,
        },
      },
    });

    if (updated.count !== 1) {
      return false;
    }

    await tx.session.deleteMany({
      where: {
        userId: input.userId,
      },
    });

    return true;
  });
}

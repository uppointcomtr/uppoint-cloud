import "server-only";

import { prisma } from "@/db/client";
import {
  countActiveTenantMembers,
  deleteUserTenantMemberships,
  findUserTenantIds,
  softDeleteTenantIfActive,
} from "@/db/repositories/tenant-repository";

export async function softDeleteUserWithCleanup(
  input: { userId: string; now: Date; tombstoneEmail: string },
  client: typeof prisma = prisma,
): Promise<boolean> {
  return client.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
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

    await tx.session.deleteMany({ where: { userId: input.userId } });
    await tx.loginChallenge.deleteMany({ where: { userId: input.userId } });
    await tx.passwordResetChallenge.deleteMany({ where: { userId: input.userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId: input.userId } });
    await tx.registrationVerificationChallenge.deleteMany({ where: { userId: input.userId } });

    const memberships = await findUserTenantIds({ userId: input.userId }, tx);

    if (memberships.length > 0) {
      await deleteUserTenantMemberships({ userId: input.userId }, tx);

      const tenantIds = [...new Set(memberships)];
      for (const tenantId of tenantIds) {
        const remainingActiveMembers = await countActiveTenantMembers({ tenantId }, tx);

        if (remainingActiveMembers === 0) {
          await softDeleteTenantIfActive({ tenantId, now: input.now }, tx);
        }
      }
    }

    return true;
  });
}

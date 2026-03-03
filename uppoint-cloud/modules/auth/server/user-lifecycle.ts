import "server-only";

import {
  countActiveTenantMembers,
  deleteUserTenantMemberships,
  findUserTenantIds,
  softDeleteTenantIfActive,
} from "@/db/repositories/tenant-repository";
import { prisma } from "@/db/client";
import { logAudit } from "@/lib/audit-log";

interface SoftDeleteDependencies {
  now: () => Date;
  softDelete: (input: { userId: string; now: Date; tombstoneEmail: string }) => Promise<boolean>;
}

const defaultDependencies: SoftDeleteDependencies = {
  now: () => new Date(),
  softDelete: async ({ userId, now, tombstoneEmail }) =>
    prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: {
          id: userId,
          deletedAt: null,
        },
        data: {
          email: tombstoneEmail,
          phone: null,
          name: null,
          deletedAt: now,
          tokenVersion: {
            increment: 1,
          },
        },
      });

      if (updated.count !== 1) {
        return false;
      }

      await tx.session.deleteMany({ where: { userId } });
      await tx.loginChallenge.deleteMany({ where: { userId } });
      await tx.passwordResetChallenge.deleteMany({ where: { userId } });
      await tx.passwordResetToken.deleteMany({ where: { userId } });
      await tx.registrationVerificationChallenge.deleteMany({ where: { userId } });

      const memberships = await findUserTenantIds({ userId }, tx);

      if (memberships.length > 0) {
        await deleteUserTenantMemberships({ userId }, tx);

        const tenantIds = [...new Set(memberships)];
        for (const tenantId of tenantIds) {
          const remainingActiveMembers = await countActiveTenantMembers({ tenantId }, tx);

          if (remainingActiveMembers === 0) {
            await softDeleteTenantIfActive({ tenantId, now }, tx);
          }
        }
      }

      return true;
    }),
};

export async function softDeleteUser(
  userId: string,
  dependencies: SoftDeleteDependencies = defaultDependencies,
): Promise<boolean> {
  const now = dependencies.now();
  // Unique tombstone preserves unique index safety and enables re-registration with original email.
  const tombstoneEmail = `deleted+${userId}@deleted.invalid`;
  const deleted = await dependencies.softDelete({ userId, now, tombstoneEmail });

  if (deleted) {
    await logAudit("user_soft_deleted", "unknown", userId, {
      reason: "USER_SOFT_DELETED",
      result: "SUCCESS",
    });
  }

  return deleted;
}

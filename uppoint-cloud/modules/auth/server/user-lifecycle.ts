import "server-only";

import { prisma } from "@/db/client";

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
  return dependencies.softDelete({ userId, now, tombstoneEmail });
}

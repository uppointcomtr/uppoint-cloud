import "server-only";

import { softDeleteUserWithCleanup } from "@/db/repositories/auth-user-repository";
import { logAudit } from "@/lib/audit-log";

interface SoftDeleteDependencies {
  now: () => Date;
  softDelete: (input: { userId: string; now: Date; tombstoneEmail: string }) => Promise<boolean>;
}

const defaultDependencies: SoftDeleteDependencies = {
  now: () => new Date(),
  softDelete: async ({ userId, now, tombstoneEmail }) =>
    softDeleteUserWithCleanup({ userId, now, tombstoneEmail }),
};

export async function softDeleteUser(
  userId: string,
  dependencies: SoftDeleteDependencies = defaultDependencies,
  input: { ip?: string } = {},
): Promise<boolean> {
  const now = dependencies.now();
  // Unique tombstone preserves unique index safety and enables re-registration with original email.
  const tombstoneEmail = `deleted+${userId}@deleted.invalid`;
  const deleted = await dependencies.softDelete({ userId, now, tombstoneEmail });

  if (deleted) {
    await logAudit("user_soft_deleted", input.ip ?? "unknown", userId, {
      reason: "USER_SOFT_DELETED",
      result: "SUCCESS",
    });
  }

  return deleted;
}

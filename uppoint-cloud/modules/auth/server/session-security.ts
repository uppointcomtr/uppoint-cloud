import "server-only";

import { revokeAllUserSessions } from "@/db/repositories/auth-user-repository";
import { logAudit } from "@/lib/audit-log";

interface RevokeAllSessionsDependencies {
  revokeAllUserSessions: (input: { userId: string }) => Promise<boolean>;
  logAudit: typeof logAudit;
}

const defaultDependencies: RevokeAllSessionsDependencies = {
  revokeAllUserSessions: async (input) => revokeAllUserSessions(input),
  logAudit,
};

export async function revokeAllSessionsForUser(
  input: { userId: string; ip: string },
  dependencies: RevokeAllSessionsDependencies = defaultDependencies,
): Promise<boolean> {
  const revoked = await dependencies.revokeAllUserSessions({ userId: input.userId });

  if (revoked) {
    await dependencies.logAudit("session_revoked", input.ip, input.userId, {
      reason: "LOGOUT_ALL",
      scope: "all-sessions",
      result: "SUCCESS",
    });
  }

  return revoked;
}

import { describe, expect, it, vi } from "vitest";

import { revokeAllSessionsForUser } from "@/modules/auth/server/session-security";

describe("revokeAllSessionsForUser", () => {
  it("revokes sessions and emits audit event", async () => {
    const revokeAllUserSessions = vi.fn(async () => true);
    const logAudit = vi.fn(async () => {});

    const result = await revokeAllSessionsForUser(
      { userId: "user_1", ip: "88.236.40.120" },
      { revokeAllUserSessions, logAudit },
    );

    expect(result).toBe(true);
    expect(revokeAllUserSessions).toHaveBeenCalledWith({ userId: "user_1" });
    expect(logAudit).toHaveBeenCalledWith(
      "session_revoked",
      "88.236.40.120",
      "user_1",
      expect.objectContaining({
        reason: "LOGOUT_ALL",
        scope: "all-sessions",
        result: "SUCCESS",
      }),
    );
  });

  it("does not emit success audit when no active user was revoked", async () => {
    const revokeAllUserSessions = vi.fn(async () => false);
    const logAudit = vi.fn(async () => {});

    const result = await revokeAllSessionsForUser(
      { userId: "user_404", ip: "88.236.40.120" },
      { revokeAllUserSessions, logAudit },
    );

    expect(result).toBe(false);
    expect(logAudit).not.toHaveBeenCalled();
  });
});

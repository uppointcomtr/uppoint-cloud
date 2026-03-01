import { describe, expect, it, vi } from "vitest";

import { isSessionJtiRevoked, revokeSessionJti } from "@/lib/session-revocation";

describe("session revocation", () => {
  it("stores non-expired session jti values", async () => {
    const upsertRevokedToken = vi.fn().mockResolvedValue(undefined);
    const now = new Date("2026-03-01T10:00:00.000Z");

    await revokeSessionJti(
      {
        jti: "12345678-1234-1234-1234-123456789012",
        expiresAt: new Date("2026-03-01T11:00:00.000Z"),
      },
      {
        now: () => now,
        upsertRevokedToken,
        findRevokedTokenByJti: async () => null,
        deleteRevokedTokenById: async () => undefined,
      },
    );

    expect(upsertRevokedToken).toHaveBeenCalledTimes(1);
  });

  it("skips storing expired session jti values", async () => {
    const upsertRevokedToken = vi.fn().mockResolvedValue(undefined);
    const now = new Date("2026-03-01T10:00:00.000Z");

    await revokeSessionJti(
      {
        jti: "12345678-1234-1234-1234-123456789012",
        expiresAt: new Date("2026-03-01T09:59:59.000Z"),
      },
      {
        now: () => now,
        upsertRevokedToken,
        findRevokedTokenByJti: async () => null,
        deleteRevokedTokenById: async () => undefined,
      },
    );

    expect(upsertRevokedToken).not.toHaveBeenCalled();
  });

  it("returns true for active revoked tokens", async () => {
    const now = new Date("2026-03-01T10:00:00.000Z");
    const result = await isSessionJtiRevoked(
      "12345678-1234-1234-1234-123456789012",
      {
        now: () => now,
        upsertRevokedToken: async () => undefined,
        findRevokedTokenByJti: async () => ({
          id: "revoked_1",
          jti: "12345678-1234-1234-1234-123456789012",
          expiresAt: new Date("2026-03-01T11:00:00.000Z"),
        }),
        deleteRevokedTokenById: async () => undefined,
      },
    );

    expect(result).toBe(true);
  });

  it("cleans up expired revoked tokens and returns false", async () => {
    const deleteRevokedTokenById = vi.fn().mockResolvedValue(undefined);
    const now = new Date("2026-03-01T10:00:00.000Z");
    const result = await isSessionJtiRevoked(
      "12345678-1234-1234-1234-123456789012",
      {
        now: () => now,
        upsertRevokedToken: async () => undefined,
        findRevokedTokenByJti: async () => ({
          id: "revoked_2",
          jti: "12345678-1234-1234-1234-123456789012",
          expiresAt: new Date("2026-03-01T09:00:00.000Z"),
        }),
        deleteRevokedTokenById,
      },
    );

    expect(result).toBe(false);
    expect(deleteRevokedTokenById).toHaveBeenCalledWith("revoked_2");
  });
});

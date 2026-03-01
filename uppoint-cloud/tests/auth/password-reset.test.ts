import { describe, expect, it, vi } from "vitest";

import {
  completePasswordReset,
  requestPasswordReset,
} from "@/modules/auth/server/password-reset";

describe("requestPasswordReset", () => {
  it("does not create token or send email when user is not found", async () => {
    const deleteTokensForUser = vi.fn();
    const createToken = vi.fn();
    const sendResetEmail = vi.fn();

    await requestPasswordReset(
      { email: "missing@example.com", locale: "tr" },
      {
        findUserByEmail: vi.fn().mockResolvedValue(null),
        deleteTokensForUser,
        createToken,
        sendResetEmail,
        now: vi.fn(() => new Date("2026-02-28T00:00:00.000Z")),
        generateToken: vi.fn(() => "token"),
        hashToken: vi.fn(() => "hash"),
        buildResetUrl: vi.fn(() => "https://cloud.uppoint.com.tr/tr/reset-password?token=token"),
      },
    );

    expect(deleteTokensForUser).not.toHaveBeenCalled();
    expect(createToken).not.toHaveBeenCalled();
    expect(sendResetEmail).not.toHaveBeenCalled();
  });

  it("creates token and sends email for existing user", async () => {
    const now = new Date("2026-02-28T10:00:00.000Z");
    const createToken = vi.fn().mockResolvedValue(undefined);
    const sendResetEmail = vi.fn().mockResolvedValue(undefined);

    await requestPasswordReset(
      { email: "user@example.com", locale: "en" },
      {
        findUserByEmail: vi.fn().mockResolvedValue({
          id: "u1",
          email: "user@example.com",
          name: "User",
        }),
        deleteTokensForUser: vi.fn().mockResolvedValue(undefined),
        createToken,
        sendResetEmail,
        now: vi.fn(() => now),
        generateToken: vi.fn(() => "raw-token"),
        hashToken: vi.fn(() => "hashed-token"),
        buildResetUrl: vi
          .fn()
          .mockReturnValue("https://cloud.uppoint.com.tr/en/reset-password?token=raw-token"),
      },
    );

    expect(createToken).toHaveBeenCalledWith({
      userId: "u1",
      tokenHash: "hashed-token",
      expiresAt: new Date("2026-02-28T10:30:00.000Z"),
    });
    expect(sendResetEmail).toHaveBeenCalledWith({
      to: "user@example.com",
      locale: "en",
      name: "User",
      resetUrl: "https://cloud.uppoint.com.tr/en/reset-password?token=raw-token",
      ttlMinutes: 30,
    });
  });
});

describe("completePasswordReset", () => {
  it("throws for invalid token", async () => {
    await expect(
      completePasswordReset(
        { token: "x".repeat(64), password: "StrongPass!123" },
        {
          findTokenByHash: vi.fn().mockResolvedValue(null),
          hashPassword: vi.fn(),
          consumeTokenAndUpdatePassword: vi.fn(),
          hashToken: vi.fn(() => "token-hash"),
          now: vi.fn(() => new Date("2026-02-28T00:00:00.000Z")),
        },
      ),
    ).rejects.toMatchObject({ code: "INVALID_OR_EXPIRED_TOKEN" });
  });

  it("updates password and consumes token when token is valid", async () => {
    const consumeTokenAndUpdatePassword = vi.fn().mockResolvedValue(true);

    await completePasswordReset(
      { token: "x".repeat(64), password: "StrongPass!123" },
      {
        findTokenByHash: vi.fn().mockResolvedValue({
          id: "t1",
          userId: "u1",
          expiresAt: new Date("2026-02-28T10:30:00.000Z"),
          usedAt: null,
        }),
        hashPassword: vi.fn().mockResolvedValue("new-hash"),
        consumeTokenAndUpdatePassword,
        hashToken: vi.fn(() => "token-hash"),
        now: vi.fn(() => new Date("2026-02-28T10:00:00.000Z")),
      },
    );

    expect(consumeTokenAndUpdatePassword).toHaveBeenCalledWith({
      tokenId: "t1",
      userId: "u1",
      passwordHash: "new-hash",
      now: new Date("2026-02-28T10:00:00.000Z"),
    });
  });
});

import { describe, expect, it, vi } from "vitest";

import {
  completePasswordResetChallenge,
  startPasswordResetChallenge,
  verifyPasswordResetEmailCode,
  verifyPasswordResetSmsCode,
} from "@/modules/auth/server/password-reset-challenge";

describe("startPasswordResetChallenge", () => {
  it("returns null challenge for unknown user", async () => {
    const result = await startPasswordResetChallenge(
      { email: "missing@example.com", locale: "tr" },
      {
        findUserByEmail: vi.fn().mockResolvedValue(null),
        deleteChallengesForUser: vi.fn(),
        createChallenge: vi.fn(),
        sendEmailCode: vi.fn(),
        now: vi.fn(() => new Date("2026-02-28T12:00:00.000Z")),
        generateCode: vi.fn(() => "123456"),
        hashValue: vi.fn(() => "hash"),
      },
    );

    expect(result.challengeId).toMatch(/^decoy_/);
    expect(result.emailCodeExpiresAt).toEqual(new Date("2026-02-28T12:03:00.000Z"));
  });

  it("creates challenge and sends email for existing user", async () => {
    const createChallenge = vi.fn().mockResolvedValue({ id: "challenge-1" });
    const sendEmailCode = vi.fn().mockResolvedValue(undefined);

    const result = await startPasswordResetChallenge(
      { email: "user@example.com", locale: "en" },
      {
        findUserByEmail: vi.fn().mockResolvedValue({
          id: "u1",
          email: "user@example.com",
          phone: "+905551112233",
          name: "User",
        }),
        deleteChallengesForUser: vi.fn().mockResolvedValue(undefined),
        createChallenge,
        sendEmailCode,
        now: vi.fn(() => new Date("2026-02-28T12:00:00.000Z")),
        generateCode: vi.fn(() => "123456"),
        hashValue: vi.fn(() => "email-hash"),
      },
    );

    expect(createChallenge).toHaveBeenCalledWith({
      userId: "u1",
      emailCodeHash: "email-hash",
      emailCodeExpiresAt: new Date("2026-02-28T12:03:00.000Z"),
    });

    expect(sendEmailCode).toHaveBeenCalledTimes(1);
    expect(result.challengeId).toBe("challenge-1");
  });
});

describe("verifyPasswordResetEmailCode", () => {
  it("fails when email code is invalid", async () => {
    await expect(
      verifyPasswordResetEmailCode(
        {
          challengeId: "challenge-1",
          emailCode: "123456",
          locale: "tr",
        },
        {
          findChallengeById: vi.fn().mockResolvedValue({
            id: "challenge-1",
            userId: "u1",
            emailCodeHash: "hash-other",
            emailCodeExpiresAt: new Date("2026-02-28T12:03:00.000Z"),
            emailCodeAttempts: 0,
            emailCodeVerifiedAt: null,
            user: {
              phone: "+905551112233",
            },
          }),
          incrementEmailAttempts: vi.fn().mockResolvedValue(1),
          markEmailVerifiedAndStoreSmsCode: vi.fn(),
          sendSmsCode: vi.fn(),
          now: vi.fn(() => new Date("2026-02-28T12:00:00.000Z")),
          generateCode: vi.fn(() => "654321"),
          hashValue: vi.fn(() => "hash-input"),
        },
      ),
    ).rejects.toMatchObject({
      code: "INVALID_EMAIL_CODE",
    });
  });
});

describe("verifyPasswordResetSmsCode", () => {
  it("returns reset token for valid sms code", async () => {
    const result = await verifyPasswordResetSmsCode(
      {
        challengeId: "challenge-1",
        smsCode: "654321",
      },
      {
        findChallengeById: vi.fn().mockResolvedValue({
          id: "challenge-1",
          smsCodeHash: "sms-hash",
          smsCodeExpiresAt: new Date("2026-02-28T12:03:00.000Z"),
          smsCodeAttempts: 0,
          smsCodeVerifiedAt: null,
          emailCodeVerifiedAt: new Date("2026-02-28T12:00:30.000Z"),
        }),
        incrementSmsAttempts: vi.fn().mockResolvedValue(1),
        markSmsVerifiedAndStoreResetToken: vi.fn().mockResolvedValue(true),
        now: vi.fn(() => new Date("2026-02-28T12:01:00.000Z")),
        hashValue: vi.fn((value: string) => (value === "654321" ? "sms-hash" : "token-hash")),
        generateResetToken: vi.fn(() => "raw-reset-token"),
      },
    );

    expect(result).toEqual({ resetToken: "raw-reset-token" });
  });
});

describe("completePasswordResetChallenge", () => {
  it("updates password for valid challenge", async () => {
    const completePasswordUpdate = vi.fn().mockResolvedValue(true);

    await completePasswordResetChallenge(
      {
        challengeId: "challenge-1",
        resetToken: "x".repeat(64),
        password: "StrongPass!123",
      },
      {
        findChallengeById: vi.fn().mockResolvedValue({
          id: "challenge-1",
          userId: "u1",
          smsCodeVerifiedAt: new Date("2026-02-28T12:01:00.000Z"),
          resetTokenHash: "token-hash",
          resetTokenExpiresAt: new Date("2026-02-28T12:30:00.000Z"),
          resetTokenUsedAt: null,
        }),
        hashPassword: vi.fn().mockResolvedValue("new-hash"),
        completePasswordUpdate,
        hashValue: vi.fn(() => "token-hash"),
        now: vi.fn(() => new Date("2026-02-28T12:02:00.000Z")),
      },
    );

    expect(completePasswordUpdate).toHaveBeenCalledWith({
      challengeId: "challenge-1",
      userId: "u1",
      expectedResetTokenHash: "token-hash",
      passwordHash: "new-hash",
      now: new Date("2026-02-28T12:02:00.000Z"),
    });
  });
});

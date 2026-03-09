import { describe, expect, it, vi } from "vitest";

import {
  completeAccountDeleteChallenge,
  startAccountDeleteChallenge,
  verifyAccountDeleteEmailCode,
  verifyAccountDeleteSmsCode,
} from "@/modules/auth/server/account-delete-challenge";

describe("startAccountDeleteChallenge", () => {
  it("creates challenge and sends email for active user", async () => {
    const createChallenge = vi.fn().mockResolvedValue({ id: "challenge-1" });
    const sendEmailCode = vi.fn().mockResolvedValue(undefined);

    const result = await startAccountDeleteChallenge(
      {
        userId: "u1",
        locale: "tr",
      },
      {
        findUserById: vi.fn().mockResolvedValue({
          id: "u1",
          email: "user@example.com",
          phone: "+905551112233",
          name: "User",
        }),
        deleteChallengesForUser: vi.fn().mockResolvedValue(undefined),
        createChallenge,
        sendEmailCode,
        now: vi.fn(() => new Date("2026-03-08T10:00:00.000Z")),
        generateCode: vi.fn(() => "123456"),
        hashValue: vi.fn(() => "email-hash"),
        isSmsEnabled: vi.fn(() => true),
      },
    );

    expect(createChallenge).toHaveBeenCalledWith({
      userId: "u1",
      emailCodeHash: "email-hash",
      emailCodeExpiresAt: new Date("2026-03-08T10:03:00.000Z"),
    });
    expect(sendEmailCode).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      challengeId: "challenge-1",
      emailCodeExpiresAt: new Date("2026-03-08T10:03:00.000Z"),
    });
  });
});

describe("verifyAccountDeleteEmailCode", () => {
  it("fails when email code is invalid", async () => {
    const providedHash = "a".repeat(64);
    const storedHash = "b".repeat(64);

    await expect(
      verifyAccountDeleteEmailCode(
        {
          challengeId: "challenge-1",
          userId: "u1",
          emailCode: "123456",
          locale: "tr",
        },
        {
          findChallengeById: vi.fn().mockResolvedValue({
            id: "challenge-1",
            userId: "u1",
            emailCodeHash: storedHash,
            emailCodeExpiresAt: new Date("2026-03-08T10:03:00.000Z"),
            emailCodeAttempts: 0,
            emailCodeVerifiedAt: null,
            user: {
              phone: "+905551112233",
            },
          }),
          incrementEmailAttempts: vi.fn().mockResolvedValue(1),
          markEmailVerifiedAndStoreSmsCode: vi.fn(),
          sendSmsCode: vi.fn(),
          now: vi.fn(() => new Date("2026-03-08T10:00:00.000Z")),
          generateCode: vi.fn(() => "654321"),
          hashValue: vi.fn(() => providedHash),
          isSmsEnabled: vi.fn(() => true),
        },
      ),
    ).rejects.toMatchObject({
      code: "INVALID_EMAIL_CODE",
    });
  });
});

describe("verifyAccountDeleteSmsCode", () => {
  it("returns delete token for valid sms code", async () => {
    const smsHash = "c".repeat(64);
    const deleteTokenHash = "d".repeat(64);

    const result = await verifyAccountDeleteSmsCode(
      {
        challengeId: "challenge-1",
        userId: "u1",
        smsCode: "654321",
      },
      {
        findChallengeById: vi.fn().mockResolvedValue({
          id: "challenge-1",
          userId: "u1",
          smsCodeHash: smsHash,
          smsCodeExpiresAt: new Date("2026-03-08T10:03:00.000Z"),
          smsCodeAttempts: 0,
          smsCodeVerifiedAt: null,
          emailCodeVerifiedAt: new Date("2026-03-08T10:01:00.000Z"),
        }),
        incrementSmsAttempts: vi.fn().mockResolvedValue(1),
        markSmsVerifiedAndStoreDeleteToken: vi.fn().mockResolvedValue(true),
        now: vi.fn(() => new Date("2026-03-08T10:02:00.000Z")),
        hashValue: vi.fn((value: string) => (value === "654321" ? smsHash : deleteTokenHash)),
        generateDeleteToken: vi.fn(() => "raw-delete-token"),
      },
    );

    expect(result).toEqual({ deleteToken: "raw-delete-token" });
  });
});

describe("completeAccountDeleteChallenge", () => {
  it("completes account deletion for valid token", async () => {
    const deleteTokenHash = "e".repeat(64);
    const completeAccountDelete = vi.fn().mockResolvedValue(true);

    const result = await completeAccountDeleteChallenge(
      {
        challengeId: "challenge-1",
        userId: "u1",
        deleteToken: "x".repeat(64),
      },
      {
        findChallengeById: vi.fn().mockResolvedValue({
          id: "challenge-1",
          userId: "u1",
          smsCodeVerifiedAt: new Date("2026-03-08T10:03:00.000Z"),
          deleteTokenHash,
          deleteTokenExpiresAt: new Date("2026-03-08T10:08:00.000Z"),
          deleteTokenUsedAt: null,
        }),
        hashValue: vi.fn(() => deleteTokenHash),
        completeAccountDelete,
        now: vi.fn(() => new Date("2026-03-08T10:04:00.000Z")),
      },
    );

    expect(result).toEqual({ userId: "u1" });
    expect(completeAccountDelete).toHaveBeenCalledWith({
      challengeId: "challenge-1",
      userId: "u1",
      expectedDeleteTokenHash: deleteTokenHash,
      now: new Date("2026-03-08T10:04:00.000Z"),
    });
  });
});

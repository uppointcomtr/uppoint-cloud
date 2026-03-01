import { describe, expect, it, vi } from "vitest";

import {
  consumeLoginToken,
  startEmailLoginChallenge,
  startPhoneLoginChallenge,
  verifyLoginChallengeCode,
} from "@/modules/auth/server/login-challenge";

describe("startEmailLoginChallenge", () => {
  it("returns null challenge when credentials are invalid", async () => {
    const result = await startEmailLoginChallenge(
      {
        email: "user@example.com",
        password: "StrongPass!123",
        locale: "tr",
      },
      {
        findUserByEmail: vi.fn().mockResolvedValue({
          id: "u1",
          email: "user@example.com",
          name: "User",
          passwordHash: "hash",
          emailVerified: new Date("2026-02-28T16:00:00.000Z"),
        }),
        verifyPassword: vi.fn().mockResolvedValue(false),
        deleteChallengesForUserAndMode: vi.fn(),
        createChallenge: vi.fn(),
        sendEmailOtp: vi.fn(),
        now: vi.fn(() => new Date("2026-02-28T17:00:00.000Z")),
        generateCode: vi.fn(() => "123456"),
        hashValue: vi.fn(() => "hash"),
      },
    );

    expect(result).toEqual({ challengeId: null, codeExpiresAt: null });
  });

  it("rejects login when email is not verified", async () => {
    await expect(
      startEmailLoginChallenge(
        {
          email: "user@example.com",
          password: "StrongPass!123",
          locale: "tr",
        },
        {
          findUserByEmail: vi.fn().mockResolvedValue({
            id: "u1",
            email: "user@example.com",
            name: "User",
            passwordHash: "hash",
            emailVerified: null,
          }),
          verifyPassword: vi.fn().mockResolvedValue(true),
          deleteChallengesForUserAndMode: vi.fn(),
          createChallenge: vi.fn(),
          sendEmailOtp: vi.fn(),
          now: vi.fn(() => new Date("2026-02-28T17:00:00.000Z")),
          generateCode: vi.fn(() => "123456"),
          hashValue: vi.fn(() => "hash"),
        },
      ),
    ).rejects.toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
  });
});

describe("startPhoneLoginChallenge", () => {
  it("creates challenge for known phone", async () => {
    const createChallenge = vi.fn().mockResolvedValue({ id: "c1" });
    const sendSmsOtp = vi.fn().mockResolvedValue(undefined);

    const result = await startPhoneLoginChallenge(
      {
        phone: "+905551112233",
        password: "StrongPass!123",
        locale: "tr",
      },
      {
        findUserByPhone: vi
          .fn()
          .mockResolvedValue({
            id: "u1",
            phone: "+905551112233",
            passwordHash: "hash",
            emailVerified: new Date("2026-02-28T16:00:00.000Z"),
          }),
        verifyPassword: vi.fn().mockResolvedValue(true),
        deleteChallengesForUserAndMode: vi.fn().mockResolvedValue(undefined),
        createChallenge,
        sendSmsOtp,
        now: vi.fn(() => new Date("2026-02-28T17:00:00.000Z")),
        generateCode: vi.fn(() => "654321"),
        hashValue: vi.fn(() => "code-hash"),
        isSmsEnabled: vi.fn(() => true),
      },
    );

    expect(createChallenge).toHaveBeenCalledWith({
      userId: "u1",
      mode: "phone",
      codeHash: "code-hash",
      codeExpiresAt: new Date("2026-02-28T17:03:00.000Z"),
    });
    expect(sendSmsOtp).toHaveBeenCalledTimes(1);
    expect(result.challengeId).toBe("c1");
  });
});

describe("verifyLoginChallengeCode", () => {
  it("returns login token for valid code", async () => {
    const result = await verifyLoginChallengeCode(
      {
        challengeId: "c1",
        code: "123456",
      },
      "email",
      {
        findChallengeById: vi.fn().mockResolvedValue({
          id: "c1",
          userId: "u1",
          mode: "email",
          codeHash: "code-hash",
          codeExpiresAt: new Date("2026-02-28T17:03:00.000Z"),
          codeAttempts: 0,
          verifiedAt: null,
        }),
        incrementCodeAttempts: vi.fn().mockResolvedValue(1),
        markVerifiedAndStoreLoginToken: vi.fn().mockResolvedValue(true),
        now: vi.fn(() => new Date("2026-02-28T17:01:00.000Z")),
        hashValue: vi.fn((value: string) => (value === "123456" ? "code-hash" : "token-hash")),
        generateLoginToken: vi.fn(() => "raw-login-token"),
      },
    );

    expect(result).toEqual({ loginToken: "raw-login-token", userId: "u1" });
  });
});

describe("consumeLoginToken", () => {
  it("returns user for valid one-time login token", async () => {
    const result = await consumeLoginToken(
      { loginToken: "x".repeat(64) },
      {
        findChallengeByTokenHash: vi.fn().mockResolvedValue({
          id: "c1",
          userId: "u1",
          loginTokenExpiresAt: new Date("2026-02-28T17:11:00.000Z"),
          loginTokenUsedAt: null,
          verifiedAt: new Date("2026-02-28T17:01:00.000Z"),
          user: {
            id: "u1",
            email: "user@example.com",
            name: "User",
            tokenVersion: 0,
          },
        }),
        consumeTokenAndCleanupChallenges: vi.fn().mockResolvedValue(true),
        now: vi.fn(() => new Date("2026-02-28T17:02:00.000Z")),
        hashValue: vi.fn(() => "token-hash"),
      },
    );

    expect(result).toEqual({
      id: "u1",
      email: "user@example.com",
      name: "User",
      tokenVersion: 0,
    });
  });
});

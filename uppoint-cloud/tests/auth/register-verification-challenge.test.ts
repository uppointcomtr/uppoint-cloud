import { describe, expect, it, vi } from "vitest";

import {
  startRegisterVerificationChallenge,
  verifyRegisterEmailCode,
  verifyRegisterSmsCode,
} from "@/modules/auth/server/register-verification-challenge";

describe("startRegisterVerificationChallenge", () => {
  it("creates challenge and sends email code", async () => {
    const createChallenge = vi.fn().mockResolvedValue({ id: "challenge-1" });
    const sendEmailCode = vi.fn().mockResolvedValue(undefined);

    const result = await startRegisterVerificationChallenge(
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
        now: vi.fn(() => new Date("2026-03-01T10:00:00.000Z")),
        generateCode: vi.fn(() => "123456"),
        hashValue: vi.fn(() => "email-hash"),
      },
    );

    expect(createChallenge).toHaveBeenCalledWith({
      userId: "u1",
      emailCodeHash: "email-hash",
      emailCodeExpiresAt: new Date("2026-03-01T10:03:00.000Z"),
    });
    expect(sendEmailCode).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      challengeId: "challenge-1",
      emailCodeExpiresAt: new Date("2026-03-01T10:03:00.000Z"),
    });
  });
});

describe("verifyRegisterEmailCode", () => {
  it("fails when email code is invalid", async () => {
    await expect(
      verifyRegisterEmailCode(
        {
          challengeId: "challenge-1",
          emailCode: "123456",
          locale: "tr",
        },
        {
          findChallengeById: vi.fn().mockResolvedValue({
            id: "challenge-1",
            userId: "u1",
            emailCodeHash: "different-hash",
            emailCodeExpiresAt: new Date("2026-03-01T10:03:00.000Z"),
            emailCodeAttempts: 0,
            emailCodeVerifiedAt: null,
            user: {
              phone: "+905551112233",
            },
          }),
          incrementEmailAttempts: vi.fn().mockResolvedValue(1),
          markEmailVerifiedAndStoreSmsCode: vi.fn(),
          sendSmsCode: vi.fn(),
          now: vi.fn(() => new Date("2026-03-01T10:01:00.000Z")),
          generateCode: vi.fn(() => "654321"),
          hashValue: vi.fn(() => "email-hash"),
          isSmsEnabled: vi.fn(() => true),
        },
      ),
    ).rejects.toMatchObject({
      code: "INVALID_EMAIL_CODE",
    });
  });
});

describe("verifyRegisterSmsCode", () => {
  it("completes verification for valid sms code", async () => {
    const result = await verifyRegisterSmsCode(
      {
        challengeId: "challenge-1",
        smsCode: "654321",
      },
      {
        findChallengeById: vi.fn().mockResolvedValue({
          id: "challenge-1",
          userId: "u1",
          smsCodeHash: "sms-hash",
          smsCodeExpiresAt: new Date("2026-03-01T10:05:00.000Z"),
          smsCodeAttempts: 0,
          smsCodeVerifiedAt: null,
          emailCodeVerifiedAt: new Date("2026-03-01T10:01:00.000Z"),
        }),
        incrementSmsAttempts: vi.fn().mockResolvedValue(1),
        completeRegistrationVerification: vi.fn().mockResolvedValue(true),
        now: vi.fn(() => new Date("2026-03-01T10:02:00.000Z")),
        hashValue: vi.fn((value: string) => (value === "654321" ? "sms-hash" : "wrong-hash")),
      },
    );

    expect(result).toEqual({
      verified: true,
      userId: "u1",
    });
  });
});

import { describe, expect, it, vi } from "vitest";

import {
  startRegisterVerificationChallenge,
  verifyRegisterEmailCode,
  verifyRegisterSmsCode,
} from "@/modules/auth/server/register-verification-challenge";

describe("startRegisterVerificationChallenge", () => {
  it("creates pending challenge and sends email code", async () => {
    const createPendingChallenge = vi.fn().mockResolvedValue({ id: "challenge-1" });
    const sendEmailCode = vi.fn().mockResolvedValue(undefined);

    const result = await startRegisterVerificationChallenge(
      {
        name: "User Name",
        email: "user@example.com",
        phone: "+905551112233",
        password: "StrongPass!123",
        locale: "tr",
      },
      {
        findActiveUserByEmail: vi.fn().mockResolvedValue(null),
        findActiveUserByPhone: vi.fn().mockResolvedValue(null),
        deletePendingChallengesByEmail: vi.fn().mockResolvedValue(undefined),
        createPendingChallenge,
        sendEmailCode,
        hashPassword: vi.fn().mockResolvedValue("password-hash"),
        now: vi.fn(() => new Date("2026-03-01T10:00:00.000Z")),
        generateCode: vi.fn(() => "123456"),
        hashValue: vi.fn(() => "email-hash"),
      },
    );

    expect(createPendingChallenge).toHaveBeenCalledWith({
      email: "user@example.com",
      name: "User Name",
      phone: "+905551112233",
      passwordHash: "password-hash",
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
    // Use valid 64-char hex strings so crypto.timingSafeEqual receives same-length buffers.
    const providedHash = "a".repeat(64);
    const storedHash = "b".repeat(64);

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
            phone: "+905551112233",
            emailCodeHash: storedHash,
            emailCodeExpiresAt: new Date("2026-03-01T10:03:00.000Z"),
            emailCodeAttempts: 0,
            emailCodeVerifiedAt: null,
          }),
          incrementEmailAttempts: vi.fn().mockResolvedValue(1),
          markEmailVerifiedAndStoreSmsCode: vi.fn(),
          sendSmsCode: vi.fn(),
          now: vi.fn(() => new Date("2026-03-01T10:01:00.000Z")),
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

describe("verifyRegisterSmsCode", () => {
  it("completes verification for valid sms code", async () => {
    const smsHash = "c".repeat(64);

    const result = await verifyRegisterSmsCode(
      {
        challengeId: "challenge-1",
        smsCode: "654321",
      },
      {
        findChallengeById: vi.fn().mockResolvedValue({
          id: "challenge-1",
          email: "user@example.com",
          name: "User Name",
          phone: "+905551112233",
          passwordHash: "password-hash",
          smsCodeHash: smsHash,
          smsCodeExpiresAt: new Date("2026-03-01T10:05:00.000Z"),
          smsCodeAttempts: 0,
          smsCodeVerifiedAt: null,
          emailCodeVerifiedAt: new Date("2026-03-01T10:01:00.000Z"),
        }),
        incrementSmsAttempts: vi.fn().mockResolvedValue(1),
        completeRegistrationVerification: vi.fn().mockResolvedValue("u1"),
        now: vi.fn(() => new Date("2026-03-01T10:02:00.000Z")),
        hashValue: vi.fn((value: string) => (value === "654321" ? smsHash : "d".repeat(64))),
      },
    );

    expect(result).toEqual({
      verified: true,
      userId: "u1",
    });
  });
});

import { describe, expect, it, vi } from "vitest";

import {
  completeAccountContactChangeChallenge,
  startAccountContactChangeChallenge,
  updateAccountProfileName,
  verifyAccountContactChangeEmailCode,
  verifyAccountContactChangeSmsCode,
} from "@/modules/auth/server/account-profile";

describe("updateAccountProfileName", () => {
  it("updates the account display name", async () => {
    const result = await updateAccountProfileName(
      {
        userId: "user_1",
        name: "  Semih   Akbağ  ",
      },
      {
        findUserById: vi.fn().mockResolvedValue({
          id: "user_1",
          name: "Old Name",
          email: "user@example.com",
        }),
        updateName: vi.fn().mockResolvedValue({
          id: "user_1",
          name: "Semih Akbağ",
          email: "user@example.com",
        }),
      },
    );

    expect(result).toEqual({
      id: "user_1",
      name: "Semih Akbağ",
      email: "user@example.com",
    });
  });
});

describe("startAccountContactChangeChallenge", () => {
  it("starts an email-change challenge for a verified phone holder", async () => {
    const createChallenge = vi.fn().mockResolvedValue({ id: "challenge-1" });
    const sendEmailCode = vi.fn().mockResolvedValue(undefined);

    const result = await startAccountContactChangeChallenge(
      {
        userId: "user_1",
        locale: "tr",
        type: "EMAIL",
        nextEmail: "new@example.com",
      },
      {
        findUserById: vi.fn().mockResolvedValue({
          id: "user_1",
          name: "Semih Akbağ",
          email: "old@example.com",
          phone: "+905551112233",
          emailVerified: new Date("2026-03-01T10:00:00.000Z"),
          phoneVerifiedAt: new Date("2026-03-01T10:05:00.000Z"),
        }),
        findOtherUserByEmail: vi.fn().mockResolvedValue(null),
        findOtherUserByPhone: vi.fn().mockResolvedValue(null),
        deleteChallengesForUserAndType: vi.fn().mockResolvedValue(undefined),
        createChallenge,
        sendEmailCode,
        now: vi.fn(() => new Date("2026-03-11T10:00:00.000Z")),
        generateCode: vi.fn(() => "123456"),
        hashValue: vi.fn(() => "a".repeat(64)),
        isSmsEnabled: vi.fn(() => true),
      },
    );

    expect(createChallenge).toHaveBeenCalledWith({
      userId: "user_1",
      type: "EMAIL",
      nextEmail: "new@example.com",
      emailCodeHash: "a".repeat(64),
      emailCodeExpiresAt: new Date("2026-03-11T10:03:00.000Z"),
    });
    expect(sendEmailCode).toHaveBeenCalledTimes(1);
    expect(result.challengeId).toBe("challenge-1");
    expect(result.type).toBe("EMAIL");
  });
});

describe("verifyAccountContactChangeEmailCode", () => {
  it("rejects an invalid email code", async () => {
    await expect(
      verifyAccountContactChangeEmailCode(
        {
          challengeId: "challenge-1",
          userId: "user_1",
          emailCode: "123456",
          locale: "tr",
        },
        {
          findChallengeById: vi.fn().mockResolvedValue({
            id: "challenge-1",
            userId: "user_1",
            type: "EMAIL",
            nextEmail: "new@example.com",
            nextPhone: null,
            emailCodeHash: "b".repeat(64),
            emailCodeExpiresAt: new Date("2026-03-11T10:03:00.000Z"),
            emailCodeAttempts: 0,
            emailCodeVerifiedAt: null,
            user: {
              email: "old@example.com",
              phone: "+905551112233",
              emailVerified: new Date("2026-03-01T10:00:00.000Z"),
              phoneVerifiedAt: new Date("2026-03-01T10:05:00.000Z"),
            },
          }),
          incrementEmailAttempts: vi.fn().mockResolvedValue(1),
          markEmailVerifiedAndStoreSmsCode: vi.fn(),
          sendSmsCode: vi.fn(),
          now: vi.fn(() => new Date("2026-03-11T10:00:00.000Z")),
          generateCode: vi.fn(() => "654321"),
          hashValue: vi.fn(() => "a".repeat(64)),
          isSmsEnabled: vi.fn(() => true),
        },
      ),
    ).rejects.toMatchObject({
      code: "INVALID_EMAIL_CODE",
    });
  });
});

describe("verifyAccountContactChangeSmsCode", () => {
  it("returns a change token for a valid sms code", async () => {
    const result = await verifyAccountContactChangeSmsCode(
      {
        challengeId: "challenge-1",
        userId: "user_1",
        smsCode: "654321",
      },
      {
        findChallengeById: vi.fn().mockResolvedValue({
          id: "challenge-1",
          userId: "user_1",
          type: "PHONE",
          nextEmail: null,
          nextPhone: "+905551119999",
          smsCodeHash: "c".repeat(64),
          smsCodeExpiresAt: new Date("2026-03-11T10:03:00.000Z"),
          smsCodeAttempts: 0,
          smsCodeVerifiedAt: null,
          emailCodeVerifiedAt: new Date("2026-03-11T10:01:00.000Z"),
        }),
        incrementSmsAttempts: vi.fn().mockResolvedValue(1),
        markSmsVerifiedAndStoreChangeToken: vi.fn().mockResolvedValue(true),
        now: vi.fn(() => new Date("2026-03-11T10:02:00.000Z")),
        hashValue: vi.fn((value: string) => (value === "654321" ? "c".repeat(64) : "d".repeat(64))),
        generateChangeToken: vi.fn(() => "raw-change-token"),
      },
    );

    expect(result).toEqual({
      changeToken: "raw-change-token",
      type: "PHONE",
    });
  });
});

describe("completeAccountContactChangeChallenge", () => {
  it("completes an email change for a valid change token", async () => {
    const completeChange = vi.fn().mockResolvedValue("SUCCESS");

    const result = await completeAccountContactChangeChallenge(
      {
        challengeId: "challenge-1",
        userId: "user_1",
        changeToken: "x".repeat(64),
      },
      {
        findChallengeById: vi.fn().mockResolvedValue({
          id: "challenge-1",
          userId: "user_1",
          type: "EMAIL",
          nextEmail: "new@example.com",
          nextPhone: null,
          smsCodeVerifiedAt: new Date("2026-03-11T10:02:00.000Z"),
          changeTokenHash: "e".repeat(64),
          changeTokenExpiresAt: new Date("2026-03-11T10:07:00.000Z"),
          changeTokenUsedAt: null,
        }),
        hashValue: vi.fn(() => "e".repeat(64)),
        completeChange,
        now: vi.fn(() => new Date("2026-03-11T10:03:00.000Z")),
      },
    );

    expect(result).toEqual({
      userId: "user_1",
      type: "EMAIL",
      updatedValue: "new@example.com",
    });
    expect(completeChange).toHaveBeenCalledWith({
      challengeId: "challenge-1",
      userId: "user_1",
      expectedChangeTokenHash: "e".repeat(64),
      nextEmail: "new@example.com",
      nextPhone: undefined,
      now: new Date("2026-03-11T10:03:00.000Z"),
    });
  });
});

import "server-only";

import crypto from "crypto";
import { z } from "zod";

import {
  completeAccountDeleteAndCleanup,
  createAccountDeleteChallenge,
  deleteAccountDeleteChallengesForUser,
  findAccountDeleteChallengeForComplete,
  findAccountDeleteChallengeForEmailVerify,
  findAccountDeleteChallengeForSmsVerify,
  findActiveUserByIdForAccountDelete,
  incrementAccountDeleteEmailAttempts,
  incrementAccountDeleteSmsAttempts,
  markAccountDeleteEmailVerifiedAndStoreSmsCode,
  markAccountDeleteSmsVerifiedAndStoreDeleteToken,
} from "@/db/repositories/auth-account-delete-repository";
import { env } from "@/lib/env";
import { timingSafeEqualHex } from "@/lib/security/constant-time";
import { defaultLocale, isLocale, type Locale } from "@/modules/i18n/config";
import { enqueueEmailNotification, enqueueSmsNotification } from "@/modules/notifications/server/outbox";

import { hashOtpCode } from "./otp-hash";

const ACCOUNT_DELETE_CODE_TTL_MINUTES = 3;
const ACCOUNT_DELETE_TOKEN_TTL_MINUTES = 5;
const ACCOUNT_DELETE_MAX_ATTEMPTS = 5;

const startChallengeSchema = z.object({
  userId: z.string().trim().min(1).max(191),
  locale: z.string().optional(),
});

const verifyEmailCodeSchema = z.object({
  challengeId: z.string().trim().min(1).max(191),
  userId: z.string().trim().min(1).max(191),
  emailCode: z.string().trim().regex(/^\d{6}$/),
  locale: z.string().optional(),
});

const verifySmsCodeSchema = z.object({
  challengeId: z.string().trim().min(1).max(191),
  userId: z.string().trim().min(1).max(191),
  smsCode: z.string().trim().regex(/^\d{6}$/),
});

const completeChallengeSchema = z.object({
  challengeId: z.string().trim().min(1).max(191),
  userId: z.string().trim().min(1).max(191),
  deleteToken: z.string().trim().min(32).max(512),
});

function resolveLocale(value: string | undefined): Locale {
  if (value && isLocale(value)) {
    return value;
  }

  return defaultLocale;
}

function hashValue(value: string): string {
  return hashOtpCode(value);
}

function generateNumericCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

function generateDeleteToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function toExpiresAt(now: Date, ttlMinutes: number): Date {
  return new Date(now.getTime() + ttlMinutes * 60 * 1000);
}

function maskPhone(phone: string): string {
  const normalized = phone.replace(/\D/g, "");

  if (normalized.length < 4) {
    return "****";
  }

  const tail = normalized.slice(-4);
  return `+${"*".repeat(Math.max(0, normalized.length - 4))}${tail}`;
}

function buildEmailCodeMessage(options: {
  locale: Locale;
  name: string | null;
  code: string;
  ttlMinutes: number;
}) {
  const displayName = options.name?.trim() || "User";

  if (options.locale === "tr") {
    return {
      subject: "Uppoint Cloud hesap silme doğrulama kodu",
      text:
        `Merhaba ${displayName},\n\n` +
        `Hesap silme işlemi için e-posta doğrulama kodun: ${options.code}\n` +
        `Kod ${options.ttlMinutes} dakika geçerlidir.\n\n` +
        "Bu işlemi başlatmadıysan hesabını korumak için hemen şifreni değiştir.",
    };
  }

  return {
    subject: "Uppoint Cloud account deletion verification code",
    text:
      `Hello ${displayName},\n\n` +
      `Your email verification code for account deletion is: ${options.code}\n` +
      `The code expires in ${options.ttlMinutes} minutes.\n\n` +
      "If you did not request this action, change your password immediately.",
  };
}

function buildSmsCodeMessage(options: { locale: Locale; code: string; ttlMinutes: number }) {
  if (options.locale === "tr") {
    return `Uppoint Cloud hesap silme SMS kodunuz: ${options.code}. Gecerlilik: ${options.ttlMinutes} dk.`;
  }

  return `Uppoint Cloud account deletion SMS code: ${options.code}. Expires in ${options.ttlMinutes} min.`;
}

export class AccountDeleteChallengeError extends Error {
  constructor(
    public readonly code:
      | "INVALID_OR_EXPIRED_CHALLENGE"
      | "INVALID_EMAIL_CODE"
      | "INVALID_SMS_CODE"
      | "MAX_ATTEMPTS_REACHED"
      | "PHONE_NOT_AVAILABLE"
      | "SMS_NOT_ENABLED"
      | "DELETE_TOKEN_NOT_READY"
      | "INVALID_OR_EXPIRED_DELETE_TOKEN"
      | "UNKNOWN",
    message: string,
  ) {
    super(message);
    this.name = "AccountDeleteChallengeError";
  }
}

interface StartChallengeDependencies {
  findUserById: (userId: string) => Promise<{ id: string; email: string; phone: string | null; name: string | null } | null>;
  deleteChallengesForUser: (userId: string) => Promise<void>;
  createChallenge: (input: { userId: string; emailCodeHash: string; emailCodeExpiresAt: Date }) => Promise<{ id: string }>;
  sendEmailCode: (input: { userId: string; to: string; subject: string; text: string }) => Promise<void>;
  now: () => Date;
  generateCode: () => string;
  hashValue: (value: string) => string;
  isSmsEnabled: () => boolean;
}

const defaultStartDependencies: StartChallengeDependencies = {
  findUserById: async (userId) => findActiveUserByIdForAccountDelete(userId),
  deleteChallengesForUser: async (userId) => deleteAccountDeleteChallengesForUser(userId),
  createChallenge: async (input) => createAccountDeleteChallenge(input),
  sendEmailCode: async (input) => {
    await enqueueEmailNotification({
      userId: input.userId,
      to: input.to,
      subject: input.subject,
      text: input.text,
      metadata: {
        scope: "auth-account-delete",
        channel: "email",
      },
    });
  },
  now: () => new Date(),
  generateCode: generateNumericCode,
  hashValue,
  isSmsEnabled: () => env.UPPOINT_SMS_ENABLED,
};

export async function startAccountDeleteChallenge(
  rawInput: unknown,
  dependencies: StartChallengeDependencies = defaultStartDependencies,
): Promise<{ challengeId: string; emailCodeExpiresAt: Date }> {
  const input = startChallengeSchema.parse(rawInput);
  const locale = resolveLocale(input.locale);
  const now = dependencies.now();
  const expiresAt = toExpiresAt(now, ACCOUNT_DELETE_CODE_TTL_MINUTES);
  const user = await dependencies.findUserById(input.userId);

  if (!user) {
    throw new AccountDeleteChallengeError("INVALID_OR_EXPIRED_CHALLENGE", "User not found for account deletion");
  }

  if (!user.phone) {
    throw new AccountDeleteChallengeError("PHONE_NOT_AVAILABLE", "Phone number is required for account deletion");
  }

  if (!dependencies.isSmsEnabled()) {
    throw new AccountDeleteChallengeError("SMS_NOT_ENABLED", "SMS service is not enabled");
  }

  const emailCode = dependencies.generateCode();
  const emailCodeHash = dependencies.hashValue(emailCode);

  await dependencies.deleteChallengesForUser(user.id);

  const challenge = await dependencies.createChallenge({
    userId: user.id,
    emailCodeHash,
    emailCodeExpiresAt: expiresAt,
  });

  const mailMessage = buildEmailCodeMessage({
    locale,
    name: user.name,
    code: emailCode,
    ttlMinutes: ACCOUNT_DELETE_CODE_TTL_MINUTES,
  });

  await dependencies.sendEmailCode({
    userId: user.id,
    to: user.email,
    subject: mailMessage.subject,
    text: mailMessage.text,
  });

  return {
    challengeId: challenge.id,
    emailCodeExpiresAt: expiresAt,
  };
}

interface VerifyEmailDependencies {
  findChallengeById: (challengeId: string) => Promise<{
    id: string;
    userId: string;
    emailCodeHash: string;
    emailCodeExpiresAt: Date;
    emailCodeAttempts: number;
    emailCodeVerifiedAt: Date | null;
    user: {
      phone: string | null;
    };
  } | null>;
  incrementEmailAttempts: (challengeId: string, maxAttempts: number) => Promise<number>;
  markEmailVerifiedAndStoreSmsCode: (input: {
    id: string;
    expectedEmailCodeHash: string;
    smsCodeHash: string;
    smsCodeExpiresAt: Date;
    now: Date;
    maxAttempts: number;
  }) => Promise<boolean>;
  sendSmsCode: (input: { userId: string; to: string; text: string }) => Promise<void>;
  now: () => Date;
  generateCode: () => string;
  hashValue: (value: string) => string;
  isSmsEnabled: () => boolean;
}

const defaultVerifyEmailDependencies: VerifyEmailDependencies = {
  findChallengeById: async (challengeId) => findAccountDeleteChallengeForEmailVerify(challengeId),
  incrementEmailAttempts: async (challengeId, maxAttempts) =>
    incrementAccountDeleteEmailAttempts(challengeId, maxAttempts),
  markEmailVerifiedAndStoreSmsCode: async (input) => markAccountDeleteEmailVerifiedAndStoreSmsCode(input),
  sendSmsCode: async (input) => {
    await enqueueSmsNotification({
      userId: input.userId,
      to: input.to,
      message: input.text,
      metadata: {
        scope: "auth-account-delete",
        channel: "sms",
      },
    });
  },
  now: () => new Date(),
  generateCode: generateNumericCode,
  hashValue,
  isSmsEnabled: () => env.UPPOINT_SMS_ENABLED,
};

export async function verifyAccountDeleteEmailCode(
  rawInput: unknown,
  dependencies: VerifyEmailDependencies = defaultVerifyEmailDependencies,
): Promise<{ smsCodeExpiresAt: Date; maskedPhone: string }> {
  const input = verifyEmailCodeSchema.parse(rawInput);
  const locale = resolveLocale(input.locale);
  const now = dependencies.now();
  const smsCodeExpiresAt = toExpiresAt(now, ACCOUNT_DELETE_CODE_TTL_MINUTES);
  const challenge = await dependencies.findChallengeById(input.challengeId);

  if (
    !challenge ||
    challenge.userId !== input.userId ||
    challenge.emailCodeExpiresAt <= now ||
    challenge.emailCodeVerifiedAt
  ) {
    throw new AccountDeleteChallengeError("INVALID_OR_EXPIRED_CHALLENGE", "Account delete challenge is invalid or expired");
  }

  if (challenge.emailCodeAttempts >= ACCOUNT_DELETE_MAX_ATTEMPTS) {
    throw new AccountDeleteChallengeError("MAX_ATTEMPTS_REACHED", "Maximum account-delete challenge attempts reached");
  }

  const providedCodeHash = dependencies.hashValue(input.emailCode);

  if (!timingSafeEqualHex(providedCodeHash, challenge.emailCodeHash, 32)) {
    await dependencies.incrementEmailAttempts(challenge.id, ACCOUNT_DELETE_MAX_ATTEMPTS);
    throw new AccountDeleteChallengeError("INVALID_EMAIL_CODE", "Provided account-delete email code is invalid");
  }

  if (!challenge.user.phone) {
    throw new AccountDeleteChallengeError("PHONE_NOT_AVAILABLE", "Phone number is required for account deletion");
  }

  if (!dependencies.isSmsEnabled()) {
    throw new AccountDeleteChallengeError("SMS_NOT_ENABLED", "SMS service is not enabled");
  }

  const smsCode = dependencies.generateCode();
  const smsCodeHash = dependencies.hashValue(smsCode);

  const marked = await dependencies.markEmailVerifiedAndStoreSmsCode({
    id: challenge.id,
    expectedEmailCodeHash: challenge.emailCodeHash,
    smsCodeHash,
    smsCodeExpiresAt,
    now,
    maxAttempts: ACCOUNT_DELETE_MAX_ATTEMPTS,
  });

  if (!marked) {
    throw new AccountDeleteChallengeError("INVALID_OR_EXPIRED_CHALLENGE", "Account delete challenge is invalid or expired");
  }

  const smsMessage = buildSmsCodeMessage({
    locale,
    code: smsCode,
    ttlMinutes: ACCOUNT_DELETE_CODE_TTL_MINUTES,
  });

  await dependencies.sendSmsCode({
    userId: challenge.userId,
    to: challenge.user.phone,
    text: smsMessage,
  });

  return {
    smsCodeExpiresAt,
    maskedPhone: maskPhone(challenge.user.phone),
  };
}

interface VerifySmsDependencies {
  findChallengeById: (challengeId: string) => Promise<{
    id: string;
    userId: string;
    smsCodeHash: string | null;
    smsCodeExpiresAt: Date | null;
    smsCodeAttempts: number;
    smsCodeVerifiedAt: Date | null;
    emailCodeVerifiedAt: Date | null;
  } | null>;
  incrementSmsAttempts: (challengeId: string, maxAttempts: number) => Promise<number>;
  markSmsVerifiedAndStoreDeleteToken: (input: {
    id: string;
    expectedSmsCodeHash: string;
    deleteTokenHash: string;
    deleteTokenExpiresAt: Date;
    now: Date;
    maxAttempts: number;
  }) => Promise<boolean>;
  now: () => Date;
  hashValue: (value: string) => string;
  generateDeleteToken: () => string;
}

const defaultVerifySmsDependencies: VerifySmsDependencies = {
  findChallengeById: async (challengeId) => findAccountDeleteChallengeForSmsVerify(challengeId),
  incrementSmsAttempts: async (challengeId, maxAttempts) =>
    incrementAccountDeleteSmsAttempts(challengeId, maxAttempts),
  markSmsVerifiedAndStoreDeleteToken: async (input) =>
    markAccountDeleteSmsVerifiedAndStoreDeleteToken(input),
  now: () => new Date(),
  hashValue,
  generateDeleteToken,
};

export async function verifyAccountDeleteSmsCode(
  rawInput: unknown,
  dependencies: VerifySmsDependencies = defaultVerifySmsDependencies,
): Promise<{ deleteToken: string }> {
  const input = verifySmsCodeSchema.parse(rawInput);
  const now = dependencies.now();
  const deleteTokenExpiresAt = toExpiresAt(now, ACCOUNT_DELETE_TOKEN_TTL_MINUTES);
  const challenge = await dependencies.findChallengeById(input.challengeId);

  if (
    !challenge ||
    challenge.userId !== input.userId ||
    !challenge.emailCodeVerifiedAt ||
    !challenge.smsCodeHash ||
    !challenge.smsCodeExpiresAt ||
    challenge.smsCodeExpiresAt <= now ||
    challenge.smsCodeVerifiedAt
  ) {
    throw new AccountDeleteChallengeError("INVALID_OR_EXPIRED_CHALLENGE", "Account delete challenge is invalid or expired");
  }

  if (challenge.smsCodeAttempts >= ACCOUNT_DELETE_MAX_ATTEMPTS) {
    throw new AccountDeleteChallengeError("MAX_ATTEMPTS_REACHED", "Maximum account-delete challenge attempts reached");
  }

  const providedSmsCodeHash = dependencies.hashValue(input.smsCode);

  if (!timingSafeEqualHex(providedSmsCodeHash, challenge.smsCodeHash, 32)) {
    await dependencies.incrementSmsAttempts(challenge.id, ACCOUNT_DELETE_MAX_ATTEMPTS);
    throw new AccountDeleteChallengeError("INVALID_SMS_CODE", "Provided account-delete sms code is invalid");
  }

  const deleteToken = dependencies.generateDeleteToken();
  const deleteTokenHash = dependencies.hashValue(deleteToken);

  const marked = await dependencies.markSmsVerifiedAndStoreDeleteToken({
    id: challenge.id,
    expectedSmsCodeHash: challenge.smsCodeHash,
    deleteTokenHash,
    deleteTokenExpiresAt,
    now,
    maxAttempts: ACCOUNT_DELETE_MAX_ATTEMPTS,
  });

  if (!marked) {
    throw new AccountDeleteChallengeError("INVALID_OR_EXPIRED_CHALLENGE", "Account delete challenge is invalid or expired");
  }

  return { deleteToken };
}

interface CompleteChallengeDependencies {
  findChallengeById: (challengeId: string) => Promise<{
    id: string;
    userId: string;
    smsCodeVerifiedAt: Date | null;
    deleteTokenHash: string | null;
    deleteTokenExpiresAt: Date | null;
    deleteTokenUsedAt: Date | null;
  } | null>;
  hashValue: (value: string) => string;
  completeAccountDelete: (input: {
    challengeId: string;
    userId: string;
    expectedDeleteTokenHash: string;
    now: Date;
  }) => Promise<boolean>;
  now: () => Date;
}

const defaultCompleteDependencies: CompleteChallengeDependencies = {
  findChallengeById: async (challengeId) => findAccountDeleteChallengeForComplete(challengeId),
  hashValue,
  completeAccountDelete: async (input) => completeAccountDeleteAndCleanup(input),
  now: () => new Date(),
};

export async function completeAccountDeleteChallenge(
  rawInput: unknown,
  dependencies: CompleteChallengeDependencies = defaultCompleteDependencies,
): Promise<{ userId: string }> {
  const input = completeChallengeSchema.parse(rawInput);
  const now = dependencies.now();
  const challenge = await dependencies.findChallengeById(input.challengeId);

  if (
    !challenge ||
    challenge.userId !== input.userId ||
    !challenge.smsCodeVerifiedAt ||
    !challenge.deleteTokenHash ||
    !challenge.deleteTokenExpiresAt
  ) {
    throw new AccountDeleteChallengeError("DELETE_TOKEN_NOT_READY", "Account delete token is not available");
  }

  if (challenge.deleteTokenUsedAt || challenge.deleteTokenExpiresAt <= now) {
    throw new AccountDeleteChallengeError("INVALID_OR_EXPIRED_DELETE_TOKEN", "Account delete token is invalid or expired");
  }

  const providedDeleteTokenHash = dependencies.hashValue(input.deleteToken);

  if (!timingSafeEqualHex(providedDeleteTokenHash, challenge.deleteTokenHash, 32)) {
    throw new AccountDeleteChallengeError("INVALID_OR_EXPIRED_DELETE_TOKEN", "Account delete token is invalid or expired");
  }

  const completed = await dependencies.completeAccountDelete({
    challengeId: challenge.id,
    userId: challenge.userId,
    expectedDeleteTokenHash: challenge.deleteTokenHash,
    now,
  });

  if (!completed) {
    throw new AccountDeleteChallengeError("INVALID_OR_EXPIRED_DELETE_TOKEN", "Account delete token is invalid or expired");
  }

  return { userId: challenge.userId };
}

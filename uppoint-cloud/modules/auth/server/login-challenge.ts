import "server-only";

import crypto from "crypto";
import { z } from "zod";

import {
  clearFailedLoginAttempts,
  consumeLoginTokenAndCleanupChallenges,
  createLoginChallenge,
  deleteLoginChallengesForUserAndMode,
  findActiveUserByEmailForLogin,
  findActiveUserByPhoneForLogin,
  findLoginChallengeById,
  findLoginChallengeByTokenHash,
  incrementLoginChallengeAttempts,
  markLoginChallengeVerifiedAndStoreToken,
  registerFailedPasswordAttemptAtomic as registerFailedPasswordAttemptAtomicRepository,
} from "@/db/repositories/auth-login-repository";
import { env } from "@/lib/env";
import { timingSafeEqualHex } from "@/lib/security/constant-time";
import { getLoginSchema } from "@/modules/auth/schemas/auth-schemas";
import { defaultLocale, isLocale, type Locale } from "@/modules/i18n/config";
import { enqueueEmailNotification, enqueueSmsNotification } from "@/modules/notifications/server/outbox";

import { hashOtpCode } from "./otp-hash";
import { verifyPassword } from "./password";

const LOGIN_OTP_TTL_MINUTES = 3;
const LOGIN_TOKEN_TTL_MINUTES = 10;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_PASSWORD_MAX_ATTEMPTS = 5;
const LOGIN_PASSWORD_LOCK_MINUTES = 15;
const PHONE_LOGIN_REGEX = /^\+?[1-9]\d{9,14}$/;

const loginEmailStartSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1),
  locale: z.string().optional(),
});

const loginPhoneStartSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(1)
    .refine((value) => PHONE_LOGIN_REGEX.test(value)),
  password: z.string().min(1),
  locale: z.string().optional(),
});

const verifyLoginCodeSchema = z.object({
  challengeId: z.string().trim().min(1).max(191),
  code: z.string().trim().regex(/^\d{6}$/),
});

const consumeLoginTokenSchema = z.object({
  loginToken: z.string().trim().min(32).max(512),
});

type LoginChallengeMode = "email" | "phone";

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

function generateLoginToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function expiresAtFrom(now: Date, minutes: number): Date {
  return new Date(now.getTime() + minutes * 60 * 1000);
}

async function registerFailedPasswordAttemptAtomic(input: { userId: string; now: Date }): Promise<void> {
  const lockUntil = expiresAtFrom(input.now, LOGIN_PASSWORD_LOCK_MINUTES);
  await registerFailedPasswordAttemptAtomicRepository({
    userId: input.userId,
    now: input.now,
    maxAttempts: LOGIN_PASSWORD_MAX_ATTEMPTS,
    lockUntil,
  });
}

function buildEmailOtpMessage(options: {
  locale: Locale;
  name: string | null;
  code: string;
  ttlMinutes: number;
}) {
  const displayName = options.name?.trim() || "User";

  if (options.locale === "tr") {
    return {
      subject: "Uppoint Cloud giriş doğrulama kodu",
      text:
        `Merhaba ${displayName},\n\n` +
        `Giriş doğrulama kodun: ${options.code}\n` +
        `Kod ${options.ttlMinutes} dakika geçerlidir.\n\n` +
        "Eğer bu işlemi sen başlatmadıysan bu e-postayı yok sayabilirsin.",
    };
  }

  return {
    subject: "Uppoint Cloud sign-in verification code",
    text:
      `Hello ${displayName},\n\n` +
      `Your sign-in verification code is: ${options.code}\n` +
      `The code expires in ${options.ttlMinutes} minutes.\n\n` +
      "If this was not you, you can ignore this email.",
  };
}

function buildSmsOtpMessage(options: { locale: Locale; code: string; ttlMinutes: number }) {
  if (options.locale === "tr") {
    return `Uppoint Cloud giris dogrulama kodunuz: ${options.code}. Gecerlilik: ${options.ttlMinutes} dk.`;
  }

  return `Uppoint Cloud sign-in verification code: ${options.code}. Expires in ${options.ttlMinutes} min.`;
}

export class LoginChallengeError extends Error {
  constructor(
    public readonly code:
      | "INVALID_OR_EXPIRED_CHALLENGE"
      | "INVALID_CODE"
      | "MAX_ATTEMPTS_REACHED"
      | "SMS_NOT_ENABLED"
      | "INVALID_OR_EXPIRED_LOGIN_TOKEN"
      | "UNKNOWN",
    message: string,
  ) {
    super(message);
    this.name = "LoginChallengeError";
  }
}

interface StartEmailLoginDependencies {
  findUserByEmail: (email: string) => Promise<{
    id: string;
    email: string;
    name: string | null;
    passwordHash: string;
    emailVerified: Date | null;
    failedLoginAttempts: number;
    lockedUntil: Date | null;
  } | null>;
  verifyPassword: (password: string, hash: string) => Promise<boolean>;
  registerFailedPasswordAttempt: (input: { userId: string; now: Date }) => Promise<void>;
  clearFailedPasswordAttempts: (userId: string) => Promise<void>;
  deleteChallengesForUserAndMode: (userId: string, mode: LoginChallengeMode) => Promise<void>;
  createChallenge: (input: {
    userId: string;
    mode: LoginChallengeMode;
    codeHash: string;
    codeExpiresAt: Date;
  }) => Promise<{ id: string }>;
  sendEmailOtp: (input: { userId: string; to: string; subject: string; text: string }) => Promise<void>;
  now: () => Date;
  generateCode: () => string;
  hashValue: (value: string) => string;
}

const defaultStartEmailLoginDependencies: StartEmailLoginDependencies = {
  findUserByEmail: async (email) => findActiveUserByEmailForLogin(email),
  verifyPassword,
  registerFailedPasswordAttempt: registerFailedPasswordAttemptAtomic,
  clearFailedPasswordAttempts: async (userId) => clearFailedLoginAttempts(userId),
  deleteChallengesForUserAndMode: async (userId, mode) => deleteLoginChallengesForUserAndMode(userId, mode),
  createChallenge: async (input) => createLoginChallenge(input),
  sendEmailOtp: async (input) => enqueueEmailNotification({
    userId: input.userId,
    to: input.to,
    subject: input.subject,
    text: input.text,
    metadata: {
      scope: "auth-login",
      channel: "email",
    },
  }),
  now: () => new Date(),
  generateCode: generateNumericCode,
  hashValue,
};

export async function startEmailLoginChallenge(
  rawInput: unknown,
  dependencies: StartEmailLoginDependencies = defaultStartEmailLoginDependencies,
): Promise<{ challengeId: string | null; codeExpiresAt: Date | null }> {
  const input = loginEmailStartSchema.parse(rawInput);
  const locale = resolveLocale(input.locale);
  const localeLoginSchema = getLoginSchema(locale);
  const validationResult = localeLoginSchema.safeParse({ email: input.email, password: input.password });

  if (!validationResult.success) {
    return { challengeId: null, codeExpiresAt: null };
  }

  const now = dependencies.now();
  const user = await dependencies.findUserByEmail(input.email);

  // Security-sensitive: do not reveal whether email or password failed.
  if (!user) {
    return { challengeId: null, codeExpiresAt: null };
  }

  if (user.lockedUntil && user.lockedUntil > now) {
    return { challengeId: null, codeExpiresAt: null };
  }

  const passwordValid = await dependencies.verifyPassword(input.password, user.passwordHash);

  if (!passwordValid) {
    await dependencies.registerFailedPasswordAttempt({ userId: user.id, now });
    return { challengeId: null, codeExpiresAt: null };
  }

  if (!user.emailVerified) {
    return { challengeId: null, codeExpiresAt: null };
  }

  await dependencies.clearFailedPasswordAttempts(user.id);
  const codeExpiresAt = expiresAtFrom(now, LOGIN_OTP_TTL_MINUTES);
  const otpCode = dependencies.generateCode();
  const otpHash = dependencies.hashValue(otpCode);

  await dependencies.deleteChallengesForUserAndMode(user.id, "email");

  const challenge = await dependencies.createChallenge({
    userId: user.id,
    mode: "email",
    codeHash: otpHash,
    codeExpiresAt,
  });

  const emailMessage = buildEmailOtpMessage({
    locale,
    name: user.name,
    code: otpCode,
    ttlMinutes: LOGIN_OTP_TTL_MINUTES,
  });

  await dependencies.sendEmailOtp({
    userId: user.id,
    to: user.email,
    subject: emailMessage.subject,
    text: emailMessage.text,
  });

  return {
    challengeId: challenge.id,
    codeExpiresAt,
  };
}

interface StartPhoneLoginDependencies {
  findUserByPhone: (phone: string) => Promise<{
    id: string;
    phone: string;
    passwordHash: string;
    emailVerified: Date | null;
    failedLoginAttempts: number;
    lockedUntil: Date | null;
  } | null>;
  verifyPassword: (password: string, hash: string) => Promise<boolean>;
  registerFailedPasswordAttempt: (input: { userId: string; now: Date }) => Promise<void>;
  clearFailedPasswordAttempts: (userId: string) => Promise<void>;
  deleteChallengesForUserAndMode: (userId: string, mode: LoginChallengeMode) => Promise<void>;
  createChallenge: (input: {
    userId: string;
    mode: LoginChallengeMode;
    codeHash: string;
    codeExpiresAt: Date;
  }) => Promise<{ id: string }>;
  sendSmsOtp: (input: { userId: string; to: string; message: string }) => Promise<void>;
  now: () => Date;
  generateCode: () => string;
  hashValue: (value: string) => string;
  isSmsEnabled: () => boolean;
}

const defaultStartPhoneLoginDependencies: StartPhoneLoginDependencies = {
  findUserByPhone: async (phone) => findActiveUserByPhoneForLogin(phone),
  verifyPassword,
  registerFailedPasswordAttempt: registerFailedPasswordAttemptAtomic,
  clearFailedPasswordAttempts: async (userId) => clearFailedLoginAttempts(userId),
  deleteChallengesForUserAndMode: async (userId, mode) => deleteLoginChallengesForUserAndMode(userId, mode),
  createChallenge: async (input) => createLoginChallenge(input),
  sendSmsOtp: async (input) => enqueueSmsNotification({
    userId: input.userId,
    to: input.to,
    message: input.message,
    metadata: {
      scope: "auth-login",
      channel: "sms",
    },
  }),
  now: () => new Date(),
  generateCode: generateNumericCode,
  hashValue,
  isSmsEnabled: () => env.UPPOINT_SMS_ENABLED,
};

export async function startPhoneLoginChallenge(
  rawInput: unknown,
  dependencies: StartPhoneLoginDependencies = defaultStartPhoneLoginDependencies,
): Promise<{ challengeId: string | null; codeExpiresAt: Date | null }> {
  const input = loginPhoneStartSchema.parse(rawInput);
  const locale = resolveLocale(input.locale);

  if (!dependencies.isSmsEnabled()) {
    throw new LoginChallengeError("SMS_NOT_ENABLED", "SMS service is not enabled");
  }

  const now = dependencies.now();
  const user = await dependencies.findUserByPhone(input.phone);

  // Security-sensitive: do not reveal whether phone or password validation failed.
  if (!user) {
    return { challengeId: null, codeExpiresAt: null };
  }

  if (user.lockedUntil && user.lockedUntil > now) {
    return { challengeId: null, codeExpiresAt: null };
  }

  const isPasswordValid = await dependencies.verifyPassword(input.password, user.passwordHash);

  if (!isPasswordValid) {
    await dependencies.registerFailedPasswordAttempt({ userId: user.id, now });
    return { challengeId: null, codeExpiresAt: null };
  }

  if (!user.emailVerified) {
    return { challengeId: null, codeExpiresAt: null };
  }

  await dependencies.clearFailedPasswordAttempts(user.id);
  const codeExpiresAt = expiresAtFrom(now, LOGIN_OTP_TTL_MINUTES);
  const otpCode = dependencies.generateCode();
  const otpHash = dependencies.hashValue(otpCode);

  await dependencies.deleteChallengesForUserAndMode(user.id, "phone");

  const challenge = await dependencies.createChallenge({
    userId: user.id,
    mode: "phone",
    codeHash: otpHash,
    codeExpiresAt,
  });

  await dependencies.sendSmsOtp({
    userId: user.id,
    to: user.phone,
    message: buildSmsOtpMessage({
      locale,
      code: otpCode,
      ttlMinutes: LOGIN_OTP_TTL_MINUTES,
    }),
  });

  return {
    challengeId: challenge.id,
    codeExpiresAt,
  };
}

interface VerifyLoginCodeDependencies {
  findChallengeById: (id: string) => Promise<{
    id: string;
    userId: string;
    mode: string;
    codeHash: string;
    codeExpiresAt: Date;
    codeAttempts: number;
    verifiedAt: Date | null;
  } | null>;
  incrementCodeAttempts: (id: string) => Promise<number>;
  markVerifiedAndStoreLoginToken: (input: {
    id: string;
    mode: LoginChallengeMode;
    expectedCodeHash: string;
    maxAttempts: number;
    loginTokenHash: string;
    loginTokenExpiresAt: Date;
    now: Date;
  }) => Promise<boolean>;
  now: () => Date;
  hashValue: (value: string) => string;
  generateLoginToken: () => string;
}

const defaultVerifyLoginCodeDependencies: VerifyLoginCodeDependencies = {
  findChallengeById: async (id) => findLoginChallengeById(id),
  incrementCodeAttempts: async (id) => incrementLoginChallengeAttempts(id, LOGIN_MAX_ATTEMPTS),
  markVerifiedAndStoreLoginToken: async (input) => markLoginChallengeVerifiedAndStoreToken(input),
  now: () => new Date(),
  hashValue,
  generateLoginToken,
};

export async function verifyLoginChallengeCode(
  rawInput: unknown,
  mode: LoginChallengeMode,
  dependencies: VerifyLoginCodeDependencies = defaultVerifyLoginCodeDependencies,
): Promise<{ loginToken: string; userId: string }> {
  const input = verifyLoginCodeSchema.parse(rawInput);
  const now = dependencies.now();
  const challenge = await dependencies.findChallengeById(input.challengeId);

  if (
    !challenge ||
    challenge.mode !== mode ||
    challenge.codeExpiresAt <= now ||
    challenge.verifiedAt
  ) {
    throw new LoginChallengeError(
      "INVALID_OR_EXPIRED_CHALLENGE",
      "Login challenge is invalid or expired",
    );
  }

  if (challenge.codeAttempts >= LOGIN_MAX_ATTEMPTS) {
    throw new LoginChallengeError(
      "MAX_ATTEMPTS_REACHED",
      "Maximum login challenge attempts reached",
    );
  }

  const providedHash = dependencies.hashValue(input.code);

  // Constant-time comparison prevents timing side-channel attacks on the OTP hash.
  if (!timingSafeEqualHex(providedHash, challenge.codeHash, 32)) {
    await dependencies.incrementCodeAttempts(challenge.id);
    throw new LoginChallengeError("INVALID_CODE", "Login code is invalid");
  }

  const loginToken = dependencies.generateLoginToken();
  const loginTokenHash = dependencies.hashValue(loginToken);
  const loginTokenExpiresAt = expiresAtFrom(now, LOGIN_TOKEN_TTL_MINUTES);

  const marked = await dependencies.markVerifiedAndStoreLoginToken({
    id: challenge.id,
    mode,
    expectedCodeHash: providedHash,
    maxAttempts: LOGIN_MAX_ATTEMPTS,
    loginTokenHash,
    loginTokenExpiresAt,
    now,
  });

  if (!marked) {
    throw new LoginChallengeError(
      "INVALID_OR_EXPIRED_CHALLENGE",
      "Login challenge is invalid or expired",
    );
  }

  return {
    loginToken,
    userId: challenge.userId,
  };
}

interface ConsumeLoginTokenDependencies {
  findChallengeByTokenHash: (tokenHash: string) => Promise<{
    id: string;
    userId: string;
    loginTokenExpiresAt: Date | null;
    loginTokenUsedAt: Date | null;
    verifiedAt: Date | null;
    user: {
      id: string;
      email: string;
      name: string | null;
      tokenVersion: number;
      deletedAt: Date | null;
    };
  } | null>;
  consumeTokenAndCleanupChallenges: (input: {
    challengeId: string;
    userId: string;
    tokenHash: string;
    now: Date;
  }) => Promise<boolean>;
  now: () => Date;
  hashValue: (value: string) => string;
}

const defaultConsumeLoginTokenDependencies: ConsumeLoginTokenDependencies = {
  findChallengeByTokenHash: async (tokenHash) => findLoginChallengeByTokenHash(tokenHash),
  consumeTokenAndCleanupChallenges: async (input) => consumeLoginTokenAndCleanupChallenges(input),
  now: () => new Date(),
  hashValue,
};

export async function consumeLoginToken(
  rawInput: unknown,
  dependencies: ConsumeLoginTokenDependencies = defaultConsumeLoginTokenDependencies,
): Promise<{ id: string; email: string; name: string | null; tokenVersion: number } | null> {
  const input = consumeLoginTokenSchema.safeParse(rawInput);

  if (!input.success) {
    return null;
  }

  const now = dependencies.now();
  const tokenHash = dependencies.hashValue(input.data.loginToken);
  const challenge = await dependencies.findChallengeByTokenHash(tokenHash);

  if (
    !challenge ||
    !challenge.verifiedAt ||
    !challenge.loginTokenExpiresAt ||
    challenge.loginTokenUsedAt ||
    challenge.loginTokenExpiresAt <= now ||
    challenge.user.deletedAt
  ) {
    return null;
  }

  try {
    const consumed = await dependencies.consumeTokenAndCleanupChallenges({
      challengeId: challenge.id,
      userId: challenge.userId,
      tokenHash,
      now,
    });

    if (!consumed) {
      return null;
    }
  } catch {
    return null;
  }

  return {
    id: challenge.user.id,
    email: challenge.user.email,
    name: challenge.user.name,
    tokenVersion: challenge.user.tokenVersion,
  };
}

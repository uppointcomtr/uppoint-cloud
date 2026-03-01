import "server-only";

import crypto from "crypto";
import { z } from "zod";

import { prisma } from "@/db/client";
import { env } from "@/lib/env/server";
import { getLoginSchema } from "@/modules/auth/schemas/auth-schemas";
import { defaultLocale, isLocale, type Locale } from "@/modules/i18n/config";

import { sendAuthEmail } from "./email-service";
import { hashOtpCode } from "./otp-hash";
import { verifyPassword } from "./password";
import { sendAuthSms } from "./sms-service";

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

  // Security-sensitive: single SQL update avoids read-modify-write races under concurrent failures.
  await prisma.$executeRaw`
    UPDATE "User"
    SET
      "failedLoginAttempts" = "failedLoginAttempts" + 1,
      "lockedUntil" = CASE
        WHEN ("failedLoginAttempts" + 1) >= ${LOGIN_PASSWORD_MAX_ATTEMPTS} THEN ${lockUntil}
        ELSE "lockedUntil"
      END
    WHERE "id" = ${input.userId}
      AND "deletedAt" IS NULL
  `;
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
      | "EMAIL_NOT_VERIFIED"
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
  sendEmailOtp: (input: { to: string; subject: string; text: string }) => Promise<void>;
  now: () => Date;
  generateCode: () => string;
  hashValue: (value: string) => string;
}

const defaultStartEmailLoginDependencies: StartEmailLoginDependencies = {
  findUserByEmail: async (email) =>
    prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        emailVerified: true,
        failedLoginAttempts: true,
        lockedUntil: true,
      },
    }),
  verifyPassword,
  registerFailedPasswordAttempt: registerFailedPasswordAttemptAtomic,
  clearFailedPasswordAttempts: async (userId) => {
    await prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  },
  deleteChallengesForUserAndMode: async (userId, mode) => {
    await prisma.loginChallenge.deleteMany({ where: { userId, mode } });
  },
  createChallenge: async (input) =>
    prisma.loginChallenge.create({
      data: {
        userId: input.userId,
        mode: input.mode,
        codeHash: input.codeHash,
        codeExpiresAt: input.codeExpiresAt,
      },
      select: { id: true },
    }),
  sendEmailOtp: async (input) => sendAuthEmail(input),
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
    throw new LoginChallengeError(
      "EMAIL_NOT_VERIFIED",
      "Email address must be verified before sign-in",
    );
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
  sendSmsOtp: (input: { to: string; message: string }) => Promise<void>;
  now: () => Date;
  generateCode: () => string;
  hashValue: (value: string) => string;
  isSmsEnabled: () => boolean;
}

const defaultStartPhoneLoginDependencies: StartPhoneLoginDependencies = {
  findUserByPhone: async (phone) => {
    const user = await prisma.user.findFirst({
      where: { phone, deletedAt: null },
      select: {
        id: true,
        phone: true,
        passwordHash: true,
        emailVerified: true,
        failedLoginAttempts: true,
        lockedUntil: true,
      },
    });

    if (!user?.phone) {
      return null;
    }

    return {
      id: user.id,
      phone: user.phone,
      passwordHash: user.passwordHash,
      emailVerified: user.emailVerified,
      failedLoginAttempts: user.failedLoginAttempts,
      lockedUntil: user.lockedUntil,
    };
  },
  verifyPassword,
  registerFailedPasswordAttempt: registerFailedPasswordAttemptAtomic,
  clearFailedPasswordAttempts: async (userId) => {
    await prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  },
  deleteChallengesForUserAndMode: async (userId, mode) => {
    await prisma.loginChallenge.deleteMany({ where: { userId, mode } });
  },
  createChallenge: async (input) =>
    prisma.loginChallenge.create({
      data: {
        userId: input.userId,
        mode: input.mode,
        codeHash: input.codeHash,
        codeExpiresAt: input.codeExpiresAt,
      },
      select: { id: true },
    }),
  sendSmsOtp: async (input) => sendAuthSms(input),
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
    throw new LoginChallengeError(
      "EMAIL_NOT_VERIFIED",
      "Email address must be verified before sign-in",
    );
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
  findChallengeById: async (id) =>
    prisma.loginChallenge.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        mode: true,
        codeHash: true,
        codeExpiresAt: true,
        codeAttempts: true,
        verifiedAt: true,
      },
    }),
  incrementCodeAttempts: async (id) => {
    const result = await prisma.loginChallenge.updateMany({
      where: {
        id,
        codeAttempts: {
          lt: LOGIN_MAX_ATTEMPTS,
        },
      },
      data: {
        codeAttempts: {
          increment: 1,
        },
      },
    });
    return result.count;
  },
  markVerifiedAndStoreLoginToken: async (input) => {
    const result = await prisma.loginChallenge.updateMany({
      where: {
        id: input.id,
        mode: input.mode,
        codeHash: input.expectedCodeHash,
        codeAttempts: {
          lt: input.maxAttempts,
        },
        codeExpiresAt: {
          gt: input.now,
        },
        verifiedAt: null,
      },
      data: {
        verifiedAt: input.now,
        loginTokenHash: input.loginTokenHash,
        loginTokenExpiresAt: input.loginTokenExpiresAt,
        loginTokenUsedAt: null,
      },
    });
    return result.count === 1;
  },
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
  if (!crypto.timingSafeEqual(Buffer.from(providedHash, "hex"), Buffer.from(challenge.codeHash, "hex"))) {
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
  findChallengeByTokenHash: async (tokenHash) =>
    prisma.loginChallenge.findFirst({
      where: {
        loginTokenHash: tokenHash,
      },
      select: {
        id: true,
        userId: true,
        loginTokenExpiresAt: true,
        loginTokenUsedAt: true,
        verifiedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            tokenVersion: true,
            deletedAt: true,
          },
        },
      },
    }),
  consumeTokenAndCleanupChallenges: async (input) => {
    return prisma.$transaction(async (tx) => {
      const consumed = await tx.loginChallenge.updateMany({
        where: {
          id: input.challengeId,
          userId: input.userId,
          loginTokenHash: input.tokenHash,
          loginTokenUsedAt: null,
          verifiedAt: {
            not: null,
          },
          loginTokenExpiresAt: {
            gt: input.now,
          },
        },
        data: { loginTokenUsedAt: input.now },
      });

      if (consumed.count !== 1) {
        return false;
      }

      await tx.user.update({
        where: { id: input.userId },
        data: {
          lastLoginAt: input.now,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });

      await tx.loginChallenge.deleteMany({
        where: {
          userId: input.userId,
          id: { not: input.challengeId },
        },
      });

      return true;
    });
  },
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

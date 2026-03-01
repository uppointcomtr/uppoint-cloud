import "server-only";

import crypto from "crypto";
import { z } from "zod";

import { prisma } from "@/db/client";
import { env } from "@/lib/env/server";
import { registerSchema } from "@/modules/auth/schemas/auth-schemas";
import { defaultLocale, isLocale, type Locale } from "@/modules/i18n/config";

import { sendAuthEmail } from "./email-service";
import { hashPassword } from "./password";
import { sendAuthSms } from "./sms-service";

const PASSWORD_RESET_CODE_TTL_MINUTES = 3;
const PASSWORD_RESET_MAX_ATTEMPTS = 5;

const challengeStartSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  locale: z.string().optional(),
});

const verifyEmailCodeSchema = z.object({
  challengeId: z.string().trim().min(1).max(191),
  emailCode: z.string().trim().regex(/^\d{6}$/),
  locale: z.string().optional(),
});

const verifySmsCodeSchema = z.object({
  challengeId: z.string().trim().min(1).max(191),
  smsCode: z.string().trim().regex(/^\d{6}$/),
});

const completeChallengeSchema = z.object({
  challengeId: z.string().trim().min(1).max(191),
  resetToken: z.string().trim().min(32).max(512),
  password: registerSchema.shape.password,
});

function resolveLocale(value: string | undefined): Locale {
  if (value && isLocale(value)) {
    return value;
  }

  return defaultLocale;
}

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function generateNumericCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

function generateResetToken(): string {
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
      subject: "Uppoint Cloud e-posta doğrulama kodu",
      text:
        `Merhaba ${displayName},\n\n` +
        `Şifre sıfırlama işlemi için e-posta doğrulama kodun: ${options.code}\n` +
        `Kod ${options.ttlMinutes} dakika geçerlidir.\n\n` +
        "Eğer bu işlemi sen başlatmadıysan bu e-postayı yok sayabilirsin.",
    };
  }

  return {
    subject: "Uppoint Cloud email verification code",
    text:
      `Hello ${displayName},\n\n` +
      `Your email verification code for password reset is: ${options.code}\n` +
      `The code expires in ${options.ttlMinutes} minutes.\n\n` +
      "If this was not you, you can ignore this email.",
  };
}

function buildSmsCodeMessage(options: { locale: Locale; code: string; ttlMinutes: number }) {
  if (options.locale === "tr") {
    return `Uppoint Cloud sifre sifirlama SMS kodunuz: ${options.code}. Gecerlilik: ${options.ttlMinutes} dk.`;
  }

  return `Uppoint Cloud password reset SMS code: ${options.code}. Expires in ${options.ttlMinutes} min.`;
}

export class PasswordResetChallengeError extends Error {
  constructor(
    public readonly code:
      | "INVALID_OR_EXPIRED_CHALLENGE"
      | "INVALID_EMAIL_CODE"
      | "INVALID_SMS_CODE"
      | "MAX_ATTEMPTS_REACHED"
      | "PHONE_NOT_AVAILABLE"
      | "SMS_NOT_ENABLED"
      | "RESET_TOKEN_NOT_READY"
      | "INVALID_OR_EXPIRED_RESET_TOKEN"
      | "UNKNOWN",
    message: string,
  ) {
    super(message);
    this.name = "PasswordResetChallengeError";
  }
}

interface StartChallengeDependencies {
  findUserByEmail: (email: string) => Promise<{ id: string; email: string; phone: string | null; name: string | null } | null>;
  deleteChallengesForUser: (userId: string) => Promise<void>;
  createChallenge: (input: { userId: string; emailCodeHash: string; emailCodeExpiresAt: Date }) => Promise<{ id: string }>;
  sendEmailCode: (input: { to: string; subject: string; text: string }) => Promise<void>;
  now: () => Date;
  generateCode: () => string;
  hashValue: (value: string) => string;
}

const defaultStartDependencies: StartChallengeDependencies = {
  findUserByEmail: async (email) =>
    prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, phone: true, name: true },
    }),
  deleteChallengesForUser: async (userId) => {
    await prisma.passwordResetChallenge.deleteMany({ where: { userId } });
  },
  createChallenge: async (input) =>
    prisma.passwordResetChallenge.create({
      data: {
        userId: input.userId,
        emailCodeHash: input.emailCodeHash,
        emailCodeExpiresAt: input.emailCodeExpiresAt,
      },
      select: { id: true },
    }),
  sendEmailCode: async (input) => {
    await sendAuthEmail(input);
  },
  now: () => new Date(),
  generateCode: generateNumericCode,
  hashValue,
};

export async function startPasswordResetChallenge(
  rawInput: unknown,
  dependencies: StartChallengeDependencies = defaultStartDependencies,
): Promise<{ challengeId: string | null; emailCodeExpiresAt: Date | null }> {
  const input = challengeStartSchema.parse(rawInput);
  const locale = resolveLocale(input.locale);
  const now = dependencies.now();
  const expiresAt = toExpiresAt(now, PASSWORD_RESET_CODE_TTL_MINUTES);
  const user = await dependencies.findUserByEmail(input.email);

  if (!user) {
    // Security-sensitive: return an opaque decoy challenge to reduce account enumeration signals.
    return {
      challengeId: `decoy_${generateResetToken().slice(0, 24)}`,
      emailCodeExpiresAt: expiresAt,
    };
  }

  const code = dependencies.generateCode();
  const codeHash = dependencies.hashValue(code);

  await dependencies.deleteChallengesForUser(user.id);

  const challenge = await dependencies.createChallenge({
    userId: user.id,
    emailCodeHash: codeHash,
    emailCodeExpiresAt: expiresAt,
  });

  const mailMessage = buildEmailCodeMessage({
    locale,
    name: user.name,
    code,
    ttlMinutes: PASSWORD_RESET_CODE_TTL_MINUTES,
  });

  await dependencies.sendEmailCode({
    to: user.email,
    subject: mailMessage.subject,
    text: mailMessage.text,
  });

  return {
    challengeId: challenge.id,
    emailCodeExpiresAt: expiresAt,
  };
}

interface VerifyEmailCodeDependencies {
  findChallengeById: (id: string) => Promise<{
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
  incrementEmailAttempts: (id: string) => Promise<number>;
  markEmailVerifiedAndStoreSmsCode: (input: {
    id: string;
    expectedEmailCodeHash: string;
    smsCodeHash: string;
    smsCodeExpiresAt: Date;
    now: Date;
  }) => Promise<boolean>;
  sendSmsCode: (input: { to: string; message: string }) => Promise<void>;
  now: () => Date;
  generateCode: () => string;
  hashValue: (value: string) => string;
}

const defaultVerifyEmailDependencies: VerifyEmailCodeDependencies = {
  findChallengeById: async (id) =>
    prisma.passwordResetChallenge.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        emailCodeHash: true,
        emailCodeExpiresAt: true,
        emailCodeAttempts: true,
        emailCodeVerifiedAt: true,
        user: {
          select: {
            phone: true,
          },
        },
      },
    }),
  incrementEmailAttempts: async (id) => {
    const result = await prisma.passwordResetChallenge.updateMany({
      where: {
        id,
        emailCodeAttempts: {
          lt: PASSWORD_RESET_MAX_ATTEMPTS,
        },
      },
      data: {
        emailCodeAttempts: {
          increment: 1,
        },
      },
    });
    return result.count;
  },
  markEmailVerifiedAndStoreSmsCode: async (input) => {
    const result = await prisma.passwordResetChallenge.updateMany({
      where: {
        id: input.id,
        emailCodeHash: input.expectedEmailCodeHash,
        emailCodeAttempts: {
          lt: PASSWORD_RESET_MAX_ATTEMPTS,
        },
        emailCodeExpiresAt: {
          gt: input.now,
        },
        emailCodeVerifiedAt: null,
      },
      data: {
        emailCodeVerifiedAt: input.now,
        smsCodeHash: input.smsCodeHash,
        smsCodeExpiresAt: input.smsCodeExpiresAt,
        smsCodeAttempts: 0,
      },
    });
    return result.count === 1;
  },
  sendSmsCode: async (input) => {
    await sendAuthSms(input);
  },
  now: () => new Date(),
  generateCode: generateNumericCode,
  hashValue,
};

export async function verifyPasswordResetEmailCode(
  rawInput: unknown,
  dependencies: VerifyEmailCodeDependencies = defaultVerifyEmailDependencies,
): Promise<{ smsCodeExpiresAt: Date; maskedPhone: string }> {
  const input = verifyEmailCodeSchema.parse(rawInput);
  const locale = resolveLocale(input.locale);
  const now = dependencies.now();
  const challenge = await dependencies.findChallengeById(input.challengeId);

  if (!challenge || challenge.emailCodeExpiresAt <= now || challenge.emailCodeVerifiedAt) {
    throw new PasswordResetChallengeError(
      "INVALID_OR_EXPIRED_CHALLENGE",
      "Password reset challenge is invalid or expired",
    );
  }

  if (challenge.emailCodeAttempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
    throw new PasswordResetChallengeError(
      "MAX_ATTEMPTS_REACHED",
      "Email verification attempts exceeded",
    );
  }

  const providedCodeHash = dependencies.hashValue(input.emailCode);

  if (providedCodeHash !== challenge.emailCodeHash) {
    await dependencies.incrementEmailAttempts(challenge.id);
    throw new PasswordResetChallengeError("INVALID_EMAIL_CODE", "Email code is invalid");
  }

  if (!challenge.user.phone) {
    throw new PasswordResetChallengeError(
      "PHONE_NOT_AVAILABLE",
      "Phone number is required for SMS verification",
    );
  }

  if (!env.UPPOINT_SMS_ENABLED) {
    throw new PasswordResetChallengeError("SMS_NOT_ENABLED", "SMS service is not enabled");
  }

  const smsCode = dependencies.generateCode();
  const smsCodeHash = dependencies.hashValue(smsCode);
  const smsCodeExpiresAt = toExpiresAt(now, PASSWORD_RESET_CODE_TTL_MINUTES);

  const marked = await dependencies.markEmailVerifiedAndStoreSmsCode({
    id: challenge.id,
    expectedEmailCodeHash: providedCodeHash,
    smsCodeHash,
    smsCodeExpiresAt,
    now,
  });

  if (!marked) {
    throw new PasswordResetChallengeError(
      "INVALID_OR_EXPIRED_CHALLENGE",
      "Password reset challenge is invalid or expired",
    );
  }

  await dependencies.sendSmsCode({
    to: challenge.user.phone,
    message: buildSmsCodeMessage({
      locale,
      code: smsCode,
      ttlMinutes: PASSWORD_RESET_CODE_TTL_MINUTES,
    }),
  });

  return {
    smsCodeExpiresAt,
    maskedPhone: maskPhone(challenge.user.phone),
  };
}

interface VerifySmsCodeDependencies {
  findChallengeById: (id: string) => Promise<{
    id: string;
    smsCodeHash: string | null;
    smsCodeExpiresAt: Date | null;
    smsCodeAttempts: number;
    smsCodeVerifiedAt: Date | null;
    emailCodeVerifiedAt: Date | null;
  } | null>;
  incrementSmsAttempts: (id: string) => Promise<number>;
  markSmsVerifiedAndStoreResetToken: (input: {
    id: string;
    expectedSmsCodeHash: string;
    resetTokenHash: string;
    resetTokenExpiresAt: Date;
    now: Date;
  }) => Promise<boolean>;
  now: () => Date;
  hashValue: (value: string) => string;
  generateResetToken: () => string;
}

const defaultVerifySmsDependencies: VerifySmsCodeDependencies = {
  findChallengeById: async (id) =>
    prisma.passwordResetChallenge.findUnique({
      where: { id },
      select: {
        id: true,
        smsCodeHash: true,
        smsCodeExpiresAt: true,
        smsCodeAttempts: true,
        smsCodeVerifiedAt: true,
        emailCodeVerifiedAt: true,
      },
    }),
  incrementSmsAttempts: async (id) => {
    const result = await prisma.passwordResetChallenge.updateMany({
      where: {
        id,
        smsCodeAttempts: {
          lt: PASSWORD_RESET_MAX_ATTEMPTS,
        },
      },
      data: {
        smsCodeAttempts: {
          increment: 1,
        },
      },
    });
    return result.count;
  },
  markSmsVerifiedAndStoreResetToken: async (input) => {
    const result = await prisma.passwordResetChallenge.updateMany({
      where: {
        id: input.id,
        emailCodeVerifiedAt: {
          not: null,
        },
        smsCodeHash: input.expectedSmsCodeHash,
        smsCodeAttempts: {
          lt: PASSWORD_RESET_MAX_ATTEMPTS,
        },
        smsCodeExpiresAt: {
          gt: input.now,
        },
        smsCodeVerifiedAt: null,
      },
      data: {
        smsCodeVerifiedAt: input.now,
        resetTokenHash: input.resetTokenHash,
        resetTokenExpiresAt: input.resetTokenExpiresAt,
        resetTokenUsedAt: null,
      },
    });
    return result.count === 1;
  },
  now: () => new Date(),
  hashValue,
  generateResetToken,
};

export async function verifyPasswordResetSmsCode(
  rawInput: unknown,
  dependencies: VerifySmsCodeDependencies = defaultVerifySmsDependencies,
): Promise<{ resetToken: string }> {
  const input = verifySmsCodeSchema.parse(rawInput);
  const now = dependencies.now();
  const challenge = await dependencies.findChallengeById(input.challengeId);

  if (
    !challenge ||
    !challenge.emailCodeVerifiedAt ||
    !challenge.smsCodeHash ||
    !challenge.smsCodeExpiresAt ||
    challenge.smsCodeExpiresAt <= now ||
    challenge.smsCodeVerifiedAt
  ) {
    throw new PasswordResetChallengeError(
      "INVALID_OR_EXPIRED_CHALLENGE",
      "Password reset challenge is invalid or expired",
    );
  }

  if (challenge.smsCodeAttempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
    throw new PasswordResetChallengeError(
      "MAX_ATTEMPTS_REACHED",
      "SMS verification attempts exceeded",
    );
  }

  const providedCodeHash = dependencies.hashValue(input.smsCode);

  if (providedCodeHash !== challenge.smsCodeHash) {
    await dependencies.incrementSmsAttempts(challenge.id);
    throw new PasswordResetChallengeError("INVALID_SMS_CODE", "SMS code is invalid");
  }

  const rawResetToken = dependencies.generateResetToken();
  const resetTokenHash = dependencies.hashValue(rawResetToken);
  const resetTokenExpiresAt = toExpiresAt(now, env.AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES);

  const marked = await dependencies.markSmsVerifiedAndStoreResetToken({
    id: challenge.id,
    expectedSmsCodeHash: providedCodeHash,
    resetTokenHash,
    resetTokenExpiresAt,
    now,
  });

  if (!marked) {
    throw new PasswordResetChallengeError(
      "INVALID_OR_EXPIRED_CHALLENGE",
      "Password reset challenge is invalid or expired",
    );
  }

  return {
    resetToken: rawResetToken,
  };
}

interface CompleteChallengeDependencies {
  findChallengeById: (id: string) => Promise<{
    id: string;
    userId: string;
    smsCodeVerifiedAt: Date | null;
    resetTokenHash: string | null;
    resetTokenExpiresAt: Date | null;
    resetTokenUsedAt: Date | null;
  } | null>;
  hashPassword: (password: string) => Promise<string>;
  completePasswordUpdate: (input: {
    challengeId: string;
    userId: string;
    expectedResetTokenHash: string;
    passwordHash: string;
    now: Date;
  }) => Promise<boolean>;
  hashValue: (value: string) => string;
  now: () => Date;
}

const defaultCompleteChallengeDependencies: CompleteChallengeDependencies = {
  findChallengeById: async (id) =>
    prisma.passwordResetChallenge.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        smsCodeVerifiedAt: true,
        resetTokenHash: true,
        resetTokenExpiresAt: true,
        resetTokenUsedAt: true,
      },
    }),
  hashPassword: async (password) => hashPassword(password, env.AUTH_BCRYPT_ROUNDS),
  completePasswordUpdate: async (input) => {
    return prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetChallenge.updateMany({
        where: {
          id: input.challengeId,
          userId: input.userId,
          smsCodeVerifiedAt: {
            not: null,
          },
          resetTokenHash: input.expectedResetTokenHash,
          resetTokenExpiresAt: {
            gt: input.now,
          },
          resetTokenUsedAt: null,
        },
        data: { resetTokenUsedAt: input.now },
      });

      if (consumed.count !== 1) {
        return false;
      }

      await tx.user.update({
        where: { id: input.userId },
        data: {
          passwordHash: input.passwordHash,
          tokenVersion: {
            increment: 1,
          },
        },
      });

      await tx.passwordResetChallenge.deleteMany({
        where: {
          userId: input.userId,
          id: { not: input.challengeId },
        },
      });

      await tx.passwordResetToken.deleteMany({
        where: { userId: input.userId },
      });

      await tx.session.deleteMany({
        where: { userId: input.userId },
      });

      return true;
    });
  },
  hashValue,
  now: () => new Date(),
};

export async function completePasswordResetChallenge(
  rawInput: unknown,
  dependencies: CompleteChallengeDependencies = defaultCompleteChallengeDependencies,
): Promise<void> {
  const input = completeChallengeSchema.parse(rawInput);
  const now = dependencies.now();
  const challenge = await dependencies.findChallengeById(input.challengeId);

  if (
    !challenge ||
    !challenge.smsCodeVerifiedAt ||
    !challenge.resetTokenHash ||
    !challenge.resetTokenExpiresAt
  ) {
    throw new PasswordResetChallengeError("RESET_TOKEN_NOT_READY", "Reset token is not ready");
  }

  if (challenge.resetTokenUsedAt || challenge.resetTokenExpiresAt <= now) {
    throw new PasswordResetChallengeError(
      "INVALID_OR_EXPIRED_RESET_TOKEN",
      "Reset token is invalid or expired",
    );
  }

  if (dependencies.hashValue(input.resetToken) !== challenge.resetTokenHash) {
    throw new PasswordResetChallengeError(
      "INVALID_OR_EXPIRED_RESET_TOKEN",
      "Reset token is invalid or expired",
    );
  }

  const newPasswordHash = await dependencies.hashPassword(input.password);

  try {
    const completed = await dependencies.completePasswordUpdate({
      challengeId: challenge.id,
      userId: challenge.userId,
      expectedResetTokenHash: challenge.resetTokenHash,
      passwordHash: newPasswordHash,
      now,
    });

    if (!completed) {
      throw new PasswordResetChallengeError(
        "INVALID_OR_EXPIRED_RESET_TOKEN",
        "Reset token is invalid or expired",
      );
    }
  } catch (error) {
    if (error instanceof PasswordResetChallengeError) {
      throw error;
    }

    throw new PasswordResetChallengeError("UNKNOWN", "Unable to complete password reset");
  }
}

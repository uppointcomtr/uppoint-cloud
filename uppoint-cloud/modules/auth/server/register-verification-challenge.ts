import "server-only";

import crypto from "crypto";
import { z } from "zod";

import { prisma } from "@/db/client";
import { env } from "@/lib/env/server";
import { defaultLocale, isLocale, type Locale } from "@/modules/i18n/config";

import { sendAuthEmail } from "./email-service";
import { sendAuthSms } from "./sms-service";

const REGISTER_CODE_TTL_MINUTES = 3;
const REGISTER_MAX_ATTEMPTS = 5;

const startRegisterVerificationSchema = z.object({
  userId: z.string().trim().min(1).max(191),
  locale: z.string().optional(),
});

const verifyRegisterEmailCodeSchema = z.object({
  challengeId: z.string().trim().min(1).max(191),
  emailCode: z.string().trim().regex(/^\d{6}$/),
  locale: z.string().optional(),
});

const verifyRegisterSmsCodeSchema = z.object({
  challengeId: z.string().trim().min(1).max(191),
  smsCode: z.string().trim().regex(/^\d{6}$/),
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

function expiresAtFrom(now: Date, ttlMinutes: number): Date {
  return new Date(now.getTime() + ttlMinutes * 60 * 1000);
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.length < 4) {
    return "****";
  }

  return `+${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function buildRegisterEmailCodeMessage(options: {
  locale: Locale;
  name: string | null;
  code: string;
  ttlMinutes: number;
}) {
  const displayName = options.name?.trim() || "User";

  if (options.locale === "tr") {
    return {
      subject: "Uppoint Cloud kayit dogrulama kodu",
      text:
        `Merhaba ${displayName},\n\n` +
        `Hesap olusturma islemi icin e-posta dogrulama kodunuz: ${options.code}\n` +
        `Kod ${options.ttlMinutes} dakika gecerlidir.\n\n` +
        "Eger bu islemi siz baslatmadiysaniz bu e-postayi yok sayabilirsiniz.",
    };
  }

  return {
    subject: "Uppoint Cloud registration verification code",
    text:
      `Hello ${displayName},\n\n` +
      `Your email verification code for registration is: ${options.code}\n` +
      `The code expires in ${options.ttlMinutes} minutes.\n\n` +
      "If this was not you, you can ignore this email.",
  };
}

function buildRegisterSmsCodeMessage(options: {
  locale: Locale;
  code: string;
  ttlMinutes: number;
}) {
  if (options.locale === "tr") {
    return `Uppoint Cloud kayit SMS kodunuz: ${options.code}. Gecerlilik: ${options.ttlMinutes} dk.`;
  }

  return `Uppoint Cloud registration SMS code: ${options.code}. Expires in ${options.ttlMinutes} min.`;
}

export class RegisterVerificationChallengeError extends Error {
  constructor(
    public readonly code:
      | "INVALID_OR_EXPIRED_CHALLENGE"
      | "INVALID_EMAIL_CODE"
      | "INVALID_SMS_CODE"
      | "MAX_ATTEMPTS_REACHED"
      | "SMS_NOT_ENABLED"
      | "SMS_DELIVERY_FAILED"
      | "PHONE_NOT_AVAILABLE"
      | "USER_NOT_FOUND"
      | "UNKNOWN",
    message: string,
  ) {
    super(message);
    this.name = "RegisterVerificationChallengeError";
  }
}

interface StartRegisterVerificationDependencies {
  findUserById: (userId: string) => Promise<{
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
  } | null>;
  deleteChallengesForUser: (userId: string) => Promise<void>;
  createChallenge: (input: {
    userId: string;
    emailCodeHash: string;
    emailCodeExpiresAt: Date;
  }) => Promise<{ id: string }>;
  sendEmailCode: (input: { to: string; subject: string; text: string }) => Promise<void>;
  now: () => Date;
  generateCode: () => string;
  hashValue: (value: string) => string;
}

const defaultStartRegisterVerificationDependencies: StartRegisterVerificationDependencies = {
  findUserById: async (userId) =>
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, phone: true },
    }),
  deleteChallengesForUser: async (userId) => {
    await prisma.registrationVerificationChallenge.deleteMany({ where: { userId } });
  },
  createChallenge: async (input) =>
    prisma.registrationVerificationChallenge.create({
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

export async function startRegisterVerificationChallenge(
  rawInput: unknown,
  dependencies: StartRegisterVerificationDependencies = defaultStartRegisterVerificationDependencies,
): Promise<{ challengeId: string; emailCodeExpiresAt: Date }> {
  const input = startRegisterVerificationSchema.parse(rawInput);
  const locale = resolveLocale(input.locale);
  const user = await dependencies.findUserById(input.userId);

  if (!user) {
    throw new RegisterVerificationChallengeError("USER_NOT_FOUND", "User not found");
  }

  const now = dependencies.now();
  const emailCodeExpiresAt = expiresAtFrom(now, REGISTER_CODE_TTL_MINUTES);
  const emailCode = dependencies.generateCode();
  const emailCodeHash = dependencies.hashValue(emailCode);

  await dependencies.deleteChallengesForUser(user.id);

  const challenge = await dependencies.createChallenge({
    userId: user.id,
    emailCodeHash,
    emailCodeExpiresAt,
  });

  const message = buildRegisterEmailCodeMessage({
    locale,
    name: user.name,
    code: emailCode,
    ttlMinutes: REGISTER_CODE_TTL_MINUTES,
  });

  await dependencies.sendEmailCode({
    to: user.email,
    subject: message.subject,
    text: message.text,
  });

  return {
    challengeId: challenge.id,
    emailCodeExpiresAt,
  };
}

interface VerifyRegisterEmailCodeDependencies {
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
  incrementEmailAttempts: (id: string) => Promise<void>;
  markEmailVerifiedAndStoreSmsCode: (input: {
    id: string;
    now: Date;
    smsCodeHash: string;
    smsCodeExpiresAt: Date;
  }) => Promise<void>;
  sendSmsCode: (input: { to: string; message: string }) => Promise<void>;
  now: () => Date;
  generateCode: () => string;
  hashValue: (value: string) => string;
  isSmsEnabled: () => boolean;
}

const defaultVerifyRegisterEmailCodeDependencies: VerifyRegisterEmailCodeDependencies = {
  findChallengeById: async (id) =>
    prisma.registrationVerificationChallenge.findUnique({
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
    await prisma.registrationVerificationChallenge.update({
      where: { id },
      data: {
        emailCodeAttempts: {
          increment: 1,
        },
      },
    });
  },
  markEmailVerifiedAndStoreSmsCode: async (input) => {
    await prisma.registrationVerificationChallenge.update({
      where: { id: input.id },
      data: {
        emailCodeVerifiedAt: input.now,
        smsCodeHash: input.smsCodeHash,
        smsCodeExpiresAt: input.smsCodeExpiresAt,
        smsCodeAttempts: 0,
      },
    });
  },
  sendSmsCode: async (input) => {
    await sendAuthSms(input);
  },
  now: () => new Date(),
  generateCode: generateNumericCode,
  hashValue,
  isSmsEnabled: () => env.UPPOINT_SMS_ENABLED,
};

export async function verifyRegisterEmailCode(
  rawInput: unknown,
  dependencies: VerifyRegisterEmailCodeDependencies = defaultVerifyRegisterEmailCodeDependencies,
): Promise<{ smsCodeExpiresAt: Date; maskedPhone: string }> {
  const input = verifyRegisterEmailCodeSchema.parse(rawInput);
  const locale = resolveLocale(input.locale);
  const now = dependencies.now();
  const challenge = await dependencies.findChallengeById(input.challengeId);

  if (!challenge || challenge.emailCodeExpiresAt <= now || challenge.emailCodeVerifiedAt) {
    throw new RegisterVerificationChallengeError(
      "INVALID_OR_EXPIRED_CHALLENGE",
      "Register verification challenge is invalid or expired",
    );
  }

  if (challenge.emailCodeAttempts >= REGISTER_MAX_ATTEMPTS) {
    throw new RegisterVerificationChallengeError(
      "MAX_ATTEMPTS_REACHED",
      "Email verification attempts exceeded",
    );
  }

  const providedCodeHash = dependencies.hashValue(input.emailCode);

  if (providedCodeHash !== challenge.emailCodeHash) {
    await dependencies.incrementEmailAttempts(challenge.id);
    throw new RegisterVerificationChallengeError("INVALID_EMAIL_CODE", "Email code is invalid");
  }

  if (!challenge.user.phone) {
    throw new RegisterVerificationChallengeError(
      "PHONE_NOT_AVAILABLE",
      "Phone number is required for SMS verification",
    );
  }

  if (!dependencies.isSmsEnabled()) {
    throw new RegisterVerificationChallengeError("SMS_NOT_ENABLED", "SMS service is not enabled");
  }

  const smsCode = dependencies.generateCode();
  const smsCodeHash = dependencies.hashValue(smsCode);
  const smsCodeExpiresAt = expiresAtFrom(now, REGISTER_CODE_TTL_MINUTES);

  await dependencies.markEmailVerifiedAndStoreSmsCode({
    id: challenge.id,
    now,
    smsCodeHash,
    smsCodeExpiresAt,
  });

  try {
    await dependencies.sendSmsCode({
      to: challenge.user.phone,
      message: buildRegisterSmsCodeMessage({
        locale,
        code: smsCode,
        ttlMinutes: REGISTER_CODE_TTL_MINUTES,
      }),
    });
  } catch {
    throw new RegisterVerificationChallengeError(
      "SMS_DELIVERY_FAILED",
      "SMS delivery failed during register verification",
    );
  }

  return {
    smsCodeExpiresAt,
    maskedPhone: maskPhone(challenge.user.phone),
  };
}

interface VerifyRegisterSmsCodeDependencies {
  findChallengeById: (id: string) => Promise<{
    id: string;
    userId: string;
    smsCodeHash: string | null;
    smsCodeExpiresAt: Date | null;
    smsCodeAttempts: number;
    smsCodeVerifiedAt: Date | null;
    emailCodeVerifiedAt: Date | null;
  } | null>;
  incrementSmsAttempts: (id: string) => Promise<void>;
  completeRegistrationVerification: (input: {
    challengeId: string;
    userId: string;
    now: Date;
  }) => Promise<void>;
  now: () => Date;
  hashValue: (value: string) => string;
}

const defaultVerifyRegisterSmsCodeDependencies: VerifyRegisterSmsCodeDependencies = {
  findChallengeById: async (id) =>
    prisma.registrationVerificationChallenge.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        smsCodeHash: true,
        smsCodeExpiresAt: true,
        smsCodeAttempts: true,
        smsCodeVerifiedAt: true,
        emailCodeVerifiedAt: true,
      },
    }),
  incrementSmsAttempts: async (id) => {
    await prisma.registrationVerificationChallenge.update({
      where: { id },
      data: {
        smsCodeAttempts: {
          increment: 1,
        },
      },
    });
  },
  completeRegistrationVerification: async (input) => {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: input.userId },
        data: {
          emailVerified: input.now,
          phoneVerifiedAt: input.now,
        },
      }),
      prisma.registrationVerificationChallenge.delete({
        where: { id: input.challengeId },
      }),
    ]);
  },
  now: () => new Date(),
  hashValue,
};

export async function verifyRegisterSmsCode(
  rawInput: unknown,
  dependencies: VerifyRegisterSmsCodeDependencies = defaultVerifyRegisterSmsCodeDependencies,
): Promise<{ verified: true; userId: string }> {
  const input = verifyRegisterSmsCodeSchema.parse(rawInput);
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
    throw new RegisterVerificationChallengeError(
      "INVALID_OR_EXPIRED_CHALLENGE",
      "Register SMS challenge is invalid or expired",
    );
  }

  if (challenge.smsCodeAttempts >= REGISTER_MAX_ATTEMPTS) {
    throw new RegisterVerificationChallengeError(
      "MAX_ATTEMPTS_REACHED",
      "SMS verification attempts exceeded",
    );
  }

  const providedCodeHash = dependencies.hashValue(input.smsCode);

  if (providedCodeHash !== challenge.smsCodeHash) {
    await dependencies.incrementSmsAttempts(challenge.id);
    throw new RegisterVerificationChallengeError("INVALID_SMS_CODE", "SMS code is invalid");
  }

  await dependencies.completeRegistrationVerification({
    challengeId: challenge.id,
    userId: challenge.userId,
    now,
  });

  return {
    verified: true,
    userId: challenge.userId,
  };
}

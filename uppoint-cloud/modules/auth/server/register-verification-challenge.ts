import "server-only";

import crypto from "crypto";
import { Prisma, TenantRole } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/db/client";
import { env } from "@/lib/env";
import { timingSafeEqualHex } from "@/lib/security/constant-time";
import { getRegisterSchema } from "@/modules/auth/schemas/auth-schemas";
import { defaultLocale, isLocale, type Locale } from "@/modules/i18n/config";
import { enqueueEmailNotification, enqueueSmsNotification } from "@/modules/notifications/server/outbox";

import { hashOtpCode } from "./otp-hash";
import { hashPassword } from "./password";

export const REGISTER_CODE_TTL_MINUTES = 3;
const REGISTER_MAX_ATTEMPTS = 5;

const restartRegisterVerificationSchema = z.object({
  challengeId: z.string().trim().min(1).max(191),
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

function getLocaleFromInput(rawInput: unknown): Locale {
  if (typeof rawInput !== "object" || rawInput === null) {
    return defaultLocale;
  }

  const localeValue = (rawInput as Record<string, unknown>).locale;
  return resolveLocale(typeof localeValue === "string" ? localeValue : undefined);
}

function normalizePhone(phone: string): string {
  return phone.startsWith("+") ? phone : `+${phone}`;
}

function hashValue(value: string): string {
  return hashOtpCode(value);
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
      | "EMAIL_TAKEN"
      | "REGISTRATION_CONFLICT"
      | "UNKNOWN",
    message: string,
  ) {
    super(message);
    this.name = "RegisterVerificationChallengeError";
  }
}

interface IssueRegisterChallengeInput {
  email: string;
  name: string;
  phone: string;
  passwordHash: string;
  locale: Locale;
}

interface StartRegisterVerificationDependencies {
  findActiveUserByEmail: (email: string) => Promise<{ id: string } | null>;
  findActiveUserByPhone: (phone: string) => Promise<{ id: string } | null>;
  deletePendingChallengesByEmail: (email: string) => Promise<void>;
  createPendingChallenge: (input: {
    email: string;
    name: string;
    phone: string;
    passwordHash: string;
    emailCodeHash: string;
    emailCodeExpiresAt: Date;
  }) => Promise<{ id: string }>;
  replacePendingChallengeByEmail?: (input: {
    email: string;
    name: string;
    phone: string;
    passwordHash: string;
    emailCodeHash: string;
    emailCodeExpiresAt: Date;
  }) => Promise<{ id: string }>;
  sendEmailCode: (input: { to: string; subject: string; text: string }) => Promise<void>;
  hashPassword: (password: string) => Promise<string>;
  now: () => Date;
  generateCode: () => string;
  hashValue: (value: string) => string;
}

const defaultStartRegisterVerificationDependencies: StartRegisterVerificationDependencies = {
  findActiveUserByEmail: async (email) =>
    prisma.user.findFirst({
      where: {
        email,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    }),
  findActiveUserByPhone: async (phone) =>
    prisma.user.findFirst({
      where: {
        phone,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    }),
  deletePendingChallengesByEmail: async (email) => {
    await prisma.registrationVerificationChallenge.deleteMany({
      where: {
        email,
      },
    });
  },
  createPendingChallenge: async (input) =>
    prisma.registrationVerificationChallenge.create({
      data: {
        email: input.email,
        name: input.name,
        phone: input.phone,
        passwordHash: input.passwordHash,
        emailCodeHash: input.emailCodeHash,
        emailCodeExpiresAt: input.emailCodeExpiresAt,
      },
      select: {
        id: true,
      },
    }),
  replacePendingChallengeByEmail: async (input) =>
    prisma.$transaction(async (tx) => {
      // Security-sensitive: serialize per-email challenge replacement to avoid concurrent duplicate pending records.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(CAST(hashtext(${input.email}) AS bigint))
      `;

      await tx.registrationVerificationChallenge.deleteMany({
        where: {
          email: input.email,
        },
      });

      return tx.registrationVerificationChallenge.create({
        data: {
          email: input.email,
          name: input.name,
          phone: input.phone,
          passwordHash: input.passwordHash,
          emailCodeHash: input.emailCodeHash,
          emailCodeExpiresAt: input.emailCodeExpiresAt,
        },
        select: {
          id: true,
        },
      });
    }),
  sendEmailCode: async (input) => {
    await enqueueEmailNotification({
      to: input.to,
      subject: input.subject,
      text: input.text,
      metadata: {
        scope: "auth-register",
        channel: "email",
      },
    });
  },
  hashPassword: async (password) => hashPassword(password, env.AUTH_BCRYPT_ROUNDS),
  now: () => new Date(),
  generateCode: generateNumericCode,
  hashValue,
};

async function issueRegisterChallenge(
  input: IssueRegisterChallengeInput,
  dependencies: Pick<
    StartRegisterVerificationDependencies,
    | "deletePendingChallengesByEmail"
    | "createPendingChallenge"
    | "replacePendingChallengeByEmail"
    | "sendEmailCode"
    | "now"
    | "generateCode"
    | "hashValue"
  >,
): Promise<{ challengeId: string; emailCodeExpiresAt: Date }> {
  const now = dependencies.now();
  const emailCodeExpiresAt = expiresAtFrom(now, REGISTER_CODE_TTL_MINUTES);
  const emailCode = dependencies.generateCode();
  const emailCodeHash = dependencies.hashValue(emailCode);

  const challenge = dependencies.replacePendingChallengeByEmail
    ? await dependencies.replacePendingChallengeByEmail({
        email: input.email,
        name: input.name,
        phone: input.phone,
        passwordHash: input.passwordHash,
        emailCodeHash,
        emailCodeExpiresAt,
      })
    : await (async () => {
        await dependencies.deletePendingChallengesByEmail(input.email);
        return dependencies.createPendingChallenge({
          email: input.email,
          name: input.name,
          phone: input.phone,
          passwordHash: input.passwordHash,
          emailCodeHash,
          emailCodeExpiresAt,
        });
      })();

  const message = buildRegisterEmailCodeMessage({
    locale: input.locale,
    name: input.name,
    code: emailCode,
    ttlMinutes: REGISTER_CODE_TTL_MINUTES,
  });

  await dependencies.sendEmailCode({
    to: input.email,
    subject: message.subject,
    text: message.text,
  });

  return {
    challengeId: challenge.id,
    emailCodeExpiresAt,
  };
}

export async function startRegisterVerificationChallenge(
  rawInput: unknown,
  dependencies: StartRegisterVerificationDependencies = defaultStartRegisterVerificationDependencies,
): Promise<{ challengeId: string; emailCodeExpiresAt: Date }> {
  const locale = getLocaleFromInput(rawInput);
  const parsedRegisterInput = getRegisterSchema(locale).parse(rawInput);
  const normalizedPhone = normalizePhone(parsedRegisterInput.phone);

  const [emailUser, phoneUser] = await Promise.all([
    dependencies.findActiveUserByEmail(parsedRegisterInput.email),
    dependencies.findActiveUserByPhone(normalizedPhone),
  ]);

  if (emailUser || phoneUser) {
    throw new RegisterVerificationChallengeError(
      "EMAIL_TAKEN",
      "A user with this email or phone already exists",
    );
  }

  const passwordHash = await dependencies.hashPassword(parsedRegisterInput.password);

  return issueRegisterChallenge(
    {
      email: parsedRegisterInput.email,
      name: parsedRegisterInput.name,
      phone: normalizedPhone,
      passwordHash,
      locale,
    },
    dependencies,
  );
}

interface RestartRegisterVerificationDependencies extends StartRegisterVerificationDependencies {
  findPendingChallengeById: (challengeId: string) => Promise<{
    email: string;
    name: string;
    phone: string;
    passwordHash: string;
  } | null>;
}

const defaultRestartRegisterVerificationDependencies: RestartRegisterVerificationDependencies = {
  ...defaultStartRegisterVerificationDependencies,
  findPendingChallengeById: async (challengeId) =>
    prisma.registrationVerificationChallenge.findUnique({
      where: {
        id: challengeId,
      },
      select: {
        email: true,
        name: true,
        phone: true,
        passwordHash: true,
      },
    }),
};

export async function restartRegisterVerificationChallenge(
  rawInput: unknown,
  dependencies: RestartRegisterVerificationDependencies = defaultRestartRegisterVerificationDependencies,
): Promise<{ challengeId: string; emailCodeExpiresAt: Date }> {
  const input = restartRegisterVerificationSchema.parse(rawInput);
  const locale = resolveLocale(input.locale);
  const pendingChallenge = await dependencies.findPendingChallengeById(input.challengeId);

  if (!pendingChallenge) {
    throw new RegisterVerificationChallengeError(
      "INVALID_OR_EXPIRED_CHALLENGE",
      "Register challenge is invalid or expired",
    );
  }

  const [emailUser, phoneUser] = await Promise.all([
    dependencies.findActiveUserByEmail(pendingChallenge.email),
    dependencies.findActiveUserByPhone(pendingChallenge.phone),
  ]);

  if (emailUser || phoneUser) {
    throw new RegisterVerificationChallengeError(
      "EMAIL_TAKEN",
      "A user with this email or phone already exists",
    );
  }

  return issueRegisterChallenge(
    {
      email: pendingChallenge.email,
      name: pendingChallenge.name,
      phone: pendingChallenge.phone,
      passwordHash: pendingChallenge.passwordHash,
      locale,
    },
    dependencies,
  );
}

interface VerifyRegisterEmailCodeDependencies {
  findChallengeById: (id: string) => Promise<{
    id: string;
    phone: string;
    emailCodeHash: string;
    emailCodeExpiresAt: Date;
    emailCodeAttempts: number;
    emailCodeVerifiedAt: Date | null;
  } | null>;
  incrementEmailAttempts: (id: string) => Promise<number>;
  markEmailVerifiedAndStoreSmsCode: (input: {
    id: string;
    expectedEmailCodeHash: string;
    now: Date;
    smsCodeHash: string;
    smsCodeExpiresAt: Date;
  }) => Promise<boolean>;
  sendSmsCode: (input: { to: string; message: string }) => Promise<void>;
  now: () => Date;
  generateCode: () => string;
  hashValue: (value: string) => string;
  isSmsEnabled: () => boolean;
}

const defaultVerifyRegisterEmailCodeDependencies: VerifyRegisterEmailCodeDependencies = {
  findChallengeById: async (id) =>
    prisma.registrationVerificationChallenge.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        phone: true,
        emailCodeHash: true,
        emailCodeExpiresAt: true,
        emailCodeAttempts: true,
        emailCodeVerifiedAt: true,
      },
    }),
  incrementEmailAttempts: async (id) => {
    const result = await prisma.registrationVerificationChallenge.updateMany({
      where: {
        id,
        emailCodeAttempts: {
          lt: REGISTER_MAX_ATTEMPTS,
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
    const result = await prisma.registrationVerificationChallenge.updateMany({
      where: {
        id: input.id,
        emailCodeHash: input.expectedEmailCodeHash,
        emailCodeAttempts: {
          lt: REGISTER_MAX_ATTEMPTS,
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
    await enqueueSmsNotification({
      to: input.to,
      message: input.message,
      metadata: {
        scope: "auth-register",
        channel: "sms",
      },
    });
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

  // Constant-time comparison prevents timing side-channel attacks on the OTP hash.
  if (!timingSafeEqualHex(providedCodeHash, challenge.emailCodeHash, 32)) {
    await dependencies.incrementEmailAttempts(challenge.id);
    throw new RegisterVerificationChallengeError("INVALID_EMAIL_CODE", "Email code is invalid");
  }

  if (!challenge.phone) {
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

  const marked = await dependencies.markEmailVerifiedAndStoreSmsCode({
    id: challenge.id,
    expectedEmailCodeHash: providedCodeHash,
    now,
    smsCodeHash,
    smsCodeExpiresAt,
  });

  if (!marked) {
    throw new RegisterVerificationChallengeError(
      "INVALID_OR_EXPIRED_CHALLENGE",
      "Register verification challenge is invalid or expired",
    );
  }

  try {
    await dependencies.sendSmsCode({
      to: challenge.phone,
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
    maskedPhone: maskPhone(challenge.phone),
  };
}

interface VerifyRegisterSmsCodeDependencies {
  findChallengeById: (id: string) => Promise<{
    id: string;
    email: string;
    name: string;
    phone: string;
    passwordHash: string;
    smsCodeHash: string | null;
    smsCodeExpiresAt: Date | null;
    smsCodeAttempts: number;
    smsCodeVerifiedAt: Date | null;
    emailCodeVerifiedAt: Date | null;
  } | null>;
  incrementSmsAttempts: (id: string) => Promise<number>;
  completeRegistrationVerification: (input: {
    challengeId: string;
    email: string;
    name: string;
    phone: string;
    passwordHash: string;
    expectedSmsCodeHash: string;
    now: Date;
  }) => Promise<string | null>;
  now: () => Date;
  hashValue: (value: string) => string;
}

const defaultVerifyRegisterSmsCodeDependencies: VerifyRegisterSmsCodeDependencies = {
  findChallengeById: async (id) =>
    prisma.registrationVerificationChallenge.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        passwordHash: true,
        smsCodeHash: true,
        smsCodeExpiresAt: true,
        smsCodeAttempts: true,
        smsCodeVerifiedAt: true,
        emailCodeVerifiedAt: true,
      },
    }),
  incrementSmsAttempts: async (id) => {
    const result = await prisma.registrationVerificationChallenge.updateMany({
      where: {
        id,
        smsCodeAttempts: {
          lt: REGISTER_MAX_ATTEMPTS,
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
  completeRegistrationVerification: async (input) => {
    return prisma.$transaction(async (tx) => {
      const consumed = await tx.registrationVerificationChallenge.updateMany({
        where: {
          id: input.challengeId,
          emailCodeVerifiedAt: {
            not: null,
          },
          smsCodeHash: input.expectedSmsCodeHash,
          smsCodeExpiresAt: {
            gt: input.now,
          },
          smsCodeAttempts: {
            lt: REGISTER_MAX_ATTEMPTS,
          },
          smsCodeVerifiedAt: null,
        },
        data: {
          smsCodeVerifiedAt: input.now,
        },
      });

      if (consumed.count !== 1) {
        return null;
      }

      let userId: string;

      try {
        const user = await tx.user.create({
          data: {
            email: input.email,
            name: input.name,
            phone: input.phone,
            passwordHash: input.passwordHash,
            emailVerified: input.now,
            phoneVerifiedAt: input.now,
          },
          select: {
            id: true,
          },
        });
        userId = user.id;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError
          && error.code === "P2002"
        ) {
          throw new RegisterVerificationChallengeError(
            "REGISTRATION_CONFLICT",
            "Registration data conflicts with an existing account",
          );
        }
        throw error;
      }

      // Security-sensitive: every verified account is provisioned into an isolated tenant boundary by default.
      const tenant = await tx.tenant.create({
        data: {
          slug: `usr-${userId}`,
          name: `Workspace ${userId.slice(-6)}`,
        },
        select: {
          id: true,
        },
      });

      await tx.tenantMembership.create({
        data: {
          tenantId: tenant.id,
          userId,
          role: TenantRole.OWNER,
        },
      });

      await tx.registrationVerificationChallenge.deleteMany({
        where: {
          email: input.email,
        },
      });

      return userId;
    });
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

  // Constant-time comparison prevents timing side-channel attacks on the OTP hash.
  if (!timingSafeEqualHex(providedCodeHash, challenge.smsCodeHash, 32)) {
    await dependencies.incrementSmsAttempts(challenge.id);
    throw new RegisterVerificationChallengeError("INVALID_SMS_CODE", "SMS code is invalid");
  }

  const userId = await dependencies.completeRegistrationVerification({
    challengeId: challenge.id,
    email: challenge.email,
    name: challenge.name,
    phone: challenge.phone,
    passwordHash: challenge.passwordHash,
    expectedSmsCodeHash: providedCodeHash,
    now,
  });

  if (!userId) {
    throw new RegisterVerificationChallengeError(
      "INVALID_OR_EXPIRED_CHALLENGE",
      "Register SMS challenge is invalid or expired",
    );
  }

  return {
    verified: true,
    userId,
  };
}

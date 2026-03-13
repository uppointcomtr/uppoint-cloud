import "server-only";

import crypto from "crypto";
import { AccountContactChangeType } from "@prisma/client";
import { z } from "zod";

import {
  completeAccountContactChange,
  createAccountContactChangeChallenge,
  deleteContactChangeChallengesForUserAndType,
  findAccountContactChangeChallengeForComplete,
  findAccountContactChangeChallengeForEmailVerify,
  findAccountContactChangeChallengeForSmsVerify,
  findActiveUserByEmailExcludingUser,
  findActiveUserByPhoneExcludingUser,
  findActiveUserForAccountProfile,
  incrementAccountContactChangeEmailAttempts,
  incrementAccountContactChangeSmsAttempts,
  markAccountContactChangeEmailVerifiedAndStoreSmsCode,
  markAccountContactChangeSmsVerifiedAndStoreChangeToken,
  updateActiveUserName,
} from "@/db/repositories/auth-account-profile-repository";
import { env } from "@/lib/env";
import { timingSafeEqualHex } from "@/lib/security/constant-time";
import { defaultLocale, isLocale, type Locale } from "@/modules/i18n/config";
import { enqueueEmailNotification, enqueueSmsNotification } from "@/modules/notifications/server/outbox";

import { hashOtpCode } from "./otp-hash";

const CONTACT_CHANGE_CODE_TTL_MINUTES = 3;
const CONTACT_CHANGE_TOKEN_TTL_MINUTES = 5;
const CONTACT_CHANGE_MAX_ATTEMPTS = 5;
const PROFILE_NAME_CHANGE_CODE_TTL_MINUTES = 3;
const PROFILE_NAME_CHANGE_TOKEN_VERSION = 1;

const updateProfileNameSchema = z.object({
  userId: z.string().trim().min(1).max(191),
  name: z.string().trim().min(3).max(120),
});

const startProfileNameUpdateChallengeSchema = z.object({
  userId: z.string().trim().min(1).max(191),
  name: z.string().trim().min(3).max(120),
  locale: z.string().optional(),
});

const verifyProfileNameUpdateChallengeSchema = z.object({
  userId: z.string().trim().min(1).max(191),
  name: z.string().trim().min(3).max(120),
  locale: z.string().optional(),
  draftToken: z.string().trim().min(32).max(2048),
  emailCode: z.string().trim().regex(/^\d{6}$/),
});

const profileNameChangeChallengePayloadSchema = z.object({
  version: z.literal(PROFILE_NAME_CHANGE_TOKEN_VERSION),
  userId: z.string().trim().min(1).max(191),
  name: z.string().trim().min(3).max(120),
  emailCodeHash: z.string().trim().regex(/^[a-f0-9]{64}$/i),
  expiresAt: z.number().int().positive(),
  nonce: z.string().trim().regex(/^[a-f0-9]{16,128}$/i),
});

const startContactChangeSchema = z.discriminatedUnion("type", [
  z.object({
    userId: z.string().trim().min(1).max(191),
    locale: z.string().optional(),
    type: z.literal("EMAIL"),
    nextEmail: z.string().trim().email().max(254),
  }),
  z.object({
    userId: z.string().trim().min(1).max(191),
    locale: z.string().optional(),
    type: z.literal("PHONE"),
    nextPhone: z.string().trim().regex(/^\+?[1-9]\d{9,14}$/),
  }),
]);

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

const completeContactChangeSchema = z.object({
  challengeId: z.string().trim().min(1).max(191),
  userId: z.string().trim().min(1).max(191),
  changeToken: z.string().trim().min(32).max(512),
});

function resolveLocale(value: string | undefined): Locale {
  if (value && isLocale(value)) {
    return value;
  }

  return defaultLocale;
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function hashValue(value: string): string {
  return hashOtpCode(value);
}

function generateNumericCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

function generateChangeToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
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

function maskEmail(email: string): string {
  const [localPart, domainPart = ""] = email.split("@");
  if (!localPart) {
    return email;
  }

  const visiblePrefix = localPart.slice(0, 2);
  const visibleSuffix = localPart.length > 4 ? localPart.slice(-1) : "";
  const maskedLocal = `${visiblePrefix}${"*".repeat(Math.max(1, localPart.length - visiblePrefix.length - visibleSuffix.length))}${visibleSuffix}`;

  return `${maskedLocal}@${domainPart}`;
}

type ProfileNameChangeChallengePayload = z.infer<typeof profileNameChangeChallengePayloadSchema>;

function signProfileNameChangeChallengeToken(payload: ProfileNameChangeChallengePayload): string {
  const serializedPayload = JSON.stringify(payload);
  const encodedPayload = Buffer.from(serializedPayload, "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", env.AUTH_SECRET).update(encodedPayload).digest("hex");
  return `${encodedPayload}.${signature}`;
}

function verifyProfileNameChangeChallengeToken(
  draftToken: string,
): ProfileNameChangeChallengePayload | null {
  const tokenParts = draftToken.split(".");
  if (tokenParts.length !== 2) {
    return null;
  }

  const [encodedPayload, providedSignatureRaw] = tokenParts;
  if (!encodedPayload || !providedSignatureRaw) {
    return null;
  }

  const providedSignature = providedSignatureRaw.trim().toLowerCase();
  const expectedSignature = crypto
    .createHmac("sha256", env.AUTH_SECRET)
    .update(encodedPayload)
    .digest("hex");

  if (!timingSafeEqualHex(providedSignature, expectedSignature)) {
    return null;
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as unknown;
  } catch {
    return null;
  }

  const payloadResult = profileNameChangeChallengePayloadSchema.safeParse(parsedPayload);
  if (!payloadResult.success) {
    return null;
  }

  return payloadResult.data;
}

function buildInitialEmailMessage(options: {
  locale: Locale;
  name: string | null;
  code: string;
  ttlMinutes: number;
  type: "EMAIL" | "PHONE";
}) {
  const displayName = options.name?.trim() || "User";

  if (options.locale === "tr") {
    return {
      subject:
        options.type === "EMAIL"
          ? "Uppoint Cloud e-posta değişikliği doğrulama kodu"
          : "Uppoint Cloud telefon değişikliği doğrulama kodu",
      text:
        `Merhaba ${displayName},\n\n` +
        `${options.type === "EMAIL" ? "Yeni e-posta adresinizi" : "Telefon numarası değişikliğini"} doğrulamak için kodunuz: ${options.code}\n` +
        `Kod ${options.ttlMinutes} dakika geçerlidir.\n\n` +
        "Bu işlemi siz başlatmadıysanız hesap güvenliğiniz için hemen destek ekibiyle iletişime geçin.",
    };
  }

  return {
    subject:
      options.type === "EMAIL"
        ? "Uppoint Cloud email change verification code"
        : "Uppoint Cloud phone change verification code",
    text:
      `Hello ${displayName},\n\n` +
      `Your code to verify ${options.type === "EMAIL" ? "the new email address" : "the phone number change"} is: ${options.code}\n` +
      `The code expires in ${options.ttlMinutes} minutes.\n\n` +
      "If you did not start this request, contact support immediately.",
  };
}

function buildProfileNameChangeEmailMessage(options: {
  locale: Locale;
  currentName: string | null;
  targetName: string;
  code: string;
  ttlMinutes: number;
}) {
  const displayName = options.currentName?.trim() || "User";

  if (options.locale === "tr") {
    return {
      subject: "Uppoint Cloud ad soyad değişikliği doğrulama kodu",
      text:
        `Merhaba ${displayName},\n\n` +
        `Ad soyad bilgisini "${options.targetName}" olarak güncellemek için doğrulama kodunuz: ${options.code}\n` +
        `Kod ${options.ttlMinutes} dakika geçerlidir.\n\n` +
        "Bu işlemi siz başlatmadıysanız hesap güvenliğiniz için hemen destek ekibiyle iletişime geçin.",
    };
  }

  return {
    subject: "Uppoint Cloud profile name change verification code",
    text:
      `Hello ${displayName},\n\n` +
      `Your verification code to update your full name to "${options.targetName}" is: ${options.code}\n` +
      `The code expires in ${options.ttlMinutes} minutes.\n\n` +
      "If you did not start this request, contact support immediately.",
  };
}

function buildSmsVerificationMessage(options: {
  locale: Locale;
  code: string;
  ttlMinutes: number;
  type: "EMAIL" | "PHONE";
}) {
  if (options.locale === "tr") {
    return options.type === "EMAIL"
      ? `Uppoint Cloud e-posta degisikligi SMS kodunuz: ${options.code}. Gecerlilik: ${options.ttlMinutes} dk.`
      : `Uppoint Cloud telefon degisikligi SMS kodunuz: ${options.code}. Gecerlilik: ${options.ttlMinutes} dk.`;
  }

  return options.type === "EMAIL"
    ? `Uppoint Cloud email change SMS code: ${options.code}. Expires in ${options.ttlMinutes} min.`
    : `Uppoint Cloud phone change SMS code: ${options.code}. Expires in ${options.ttlMinutes} min.`;
}

export class AccountProfileError extends Error {
  constructor(
    public readonly code:
      | "PROFILE_NOT_FOUND"
      | "NAME_UNCHANGED"
      | "EMAIL_CHANGE_DISABLED"
      | "EMAIL_UNCHANGED"
      | "PHONE_UNCHANGED"
      | "EMAIL_TAKEN"
      | "PHONE_TAKEN"
      | "PHONE_NOT_AVAILABLE"
      | "PHONE_VERIFICATION_REQUIRED"
      | "EMAIL_VERIFICATION_REQUIRED"
      | "SMS_NOT_ENABLED"
      | "INVALID_OR_EXPIRED_CHALLENGE"
      | "INVALID_EMAIL_CODE"
      | "INVALID_SMS_CODE"
      | "MAX_ATTEMPTS_REACHED"
      | "CHANGE_TOKEN_NOT_READY"
      | "INVALID_OR_EXPIRED_CHANGE_TOKEN"
      | "UNKNOWN",
    message: string,
  ) {
    super(message);
    this.name = "AccountProfileError";
  }
}

interface UpdateProfileNameDependencies {
  findUserById: (userId: string) => Promise<{ id: string; name: string | null; email: string } | null>;
  updateName: (input: { userId: string; name: string }) => Promise<{ id: string; name: string; email: string } | null>;
}

const defaultUpdateProfileNameDependencies: UpdateProfileNameDependencies = {
  findUserById: async (userId) => findActiveUserForAccountProfile(userId),
  updateName: async (input) => updateActiveUserName(input),
};

export async function updateAccountProfileName(
  rawInput: unknown,
  dependencies: UpdateProfileNameDependencies = defaultUpdateProfileNameDependencies,
): Promise<{ id: string; name: string; email: string }> {
  const input = updateProfileNameSchema.parse(rawInput);
  const normalizedName = normalizeName(input.name);
  const user = await dependencies.findUserById(input.userId);

  if (!user) {
    throw new AccountProfileError("PROFILE_NOT_FOUND", "Profile not found");
  }

  if ((user.name?.trim() ?? "") === normalizedName) {
    throw new AccountProfileError("NAME_UNCHANGED", "Name is unchanged");
  }

  const updated = await dependencies.updateName({
    userId: input.userId,
    name: normalizedName,
  });

  if (!updated) {
    throw new AccountProfileError("PROFILE_NOT_FOUND", "Profile not found");
  }

  return updated;
}

interface StartProfileNameUpdateChallengeDependencies {
  findUserById: (userId: string) => Promise<{ id: string; name: string | null; email: string } | null>;
  sendEmailCode: (input: { userId: string; to: string; subject: string; text: string }) => Promise<void>;
  now: () => Date;
  generateCode: () => string;
  hashValue: (value: string) => string;
  generateNonce: () => string;
  signChallengeToken: (payload: ProfileNameChangeChallengePayload) => string;
}

const defaultStartProfileNameUpdateChallengeDependencies: StartProfileNameUpdateChallengeDependencies = {
  findUserById: async (userId) => findActiveUserForAccountProfile(userId),
  sendEmailCode: async (input) => {
    await enqueueEmailNotification({
      userId: input.userId,
      to: input.to,
      subject: input.subject,
      text: input.text,
      metadata: {
        scope: "auth-profile-name-change",
        channel: "email",
      },
    });
  },
  now: () => new Date(),
  generateCode: generateNumericCode,
  hashValue,
  generateNonce,
  signChallengeToken: signProfileNameChangeChallengeToken,
};

export async function startAccountProfileNameUpdateChallenge(
  rawInput: unknown,
  dependencies: StartProfileNameUpdateChallengeDependencies = defaultStartProfileNameUpdateChallengeDependencies,
): Promise<{
  draftToken: string;
  emailCodeExpiresAt: Date;
  maskedEmail: string;
}> {
  const input = startProfileNameUpdateChallengeSchema.parse(rawInput);
  const locale = resolveLocale(input.locale);
  const normalizedName = normalizeName(input.name);
  const user = await dependencies.findUserById(input.userId);

  if (!user) {
    throw new AccountProfileError("PROFILE_NOT_FOUND", "Profile not found");
  }

  if ((user.name?.trim() ?? "") === normalizedName) {
    throw new AccountProfileError("NAME_UNCHANGED", "Name is unchanged");
  }

  const now = dependencies.now();
  const emailCodeExpiresAt = toExpiresAt(now, PROFILE_NAME_CHANGE_CODE_TTL_MINUTES);
  const emailCode = dependencies.generateCode();
  const emailCodeHash = dependencies.hashValue(emailCode);

  const draftToken = dependencies.signChallengeToken({
    version: PROFILE_NAME_CHANGE_TOKEN_VERSION,
    userId: user.id,
    name: normalizedName,
    emailCodeHash,
    expiresAt: emailCodeExpiresAt.getTime(),
    nonce: dependencies.generateNonce(),
  });

  const message = buildProfileNameChangeEmailMessage({
    locale,
    currentName: user.name,
    targetName: normalizedName,
    code: emailCode,
    ttlMinutes: PROFILE_NAME_CHANGE_CODE_TTL_MINUTES,
  });

  await dependencies.sendEmailCode({
    userId: user.id,
    to: user.email,
    subject: message.subject,
    text: message.text,
  });

  return {
    draftToken,
    emailCodeExpiresAt,
    maskedEmail: maskEmail(user.email),
  };
}

interface VerifyProfileNameUpdateChallengeDependencies {
  updateName: (input: { userId: string; name: string }) => Promise<{ id: string; name: string; email: string } | null>;
  now: () => Date;
  hashValue: (value: string) => string;
  verifyChallengeToken: (draftToken: string) => ProfileNameChangeChallengePayload | null;
}

const defaultVerifyProfileNameUpdateChallengeDependencies: VerifyProfileNameUpdateChallengeDependencies = {
  updateName: async (input) => updateActiveUserName(input),
  now: () => new Date(),
  hashValue,
  verifyChallengeToken: verifyProfileNameChangeChallengeToken,
};

export async function verifyAccountProfileNameUpdateChallenge(
  rawInput: unknown,
  dependencies: VerifyProfileNameUpdateChallengeDependencies = defaultVerifyProfileNameUpdateChallengeDependencies,
): Promise<{ id: string; name: string; email: string }> {
  const input = verifyProfileNameUpdateChallengeSchema.parse(rawInput);
  const normalizedName = normalizeName(input.name);
  const challengePayload = dependencies.verifyChallengeToken(input.draftToken);

  if (!challengePayload) {
    throw new AccountProfileError("INVALID_OR_EXPIRED_CHALLENGE", "Profile update challenge is invalid");
  }

  if (challengePayload.userId !== input.userId || challengePayload.name !== normalizedName) {
    throw new AccountProfileError("INVALID_OR_EXPIRED_CHALLENGE", "Profile update challenge does not match");
  }

  if (challengePayload.expiresAt <= dependencies.now().getTime()) {
    throw new AccountProfileError("INVALID_OR_EXPIRED_CHALLENGE", "Profile update challenge is expired");
  }

  const providedEmailCodeHash = dependencies.hashValue(input.emailCode);
  if (!timingSafeEqualHex(providedEmailCodeHash, challengePayload.emailCodeHash)) {
    throw new AccountProfileError("INVALID_EMAIL_CODE", "Profile update verification code is invalid");
  }

  const updated = await dependencies.updateName({
    userId: input.userId,
    name: normalizedName,
  });

  if (!updated) {
    throw new AccountProfileError("PROFILE_NOT_FOUND", "Profile not found");
  }

  return updated;
}

interface StartContactChangeDependencies {
  findUserById: (userId: string) => Promise<ActiveContactChangeUser | null>;
  findOtherUserByEmail: (email: string, userId: string) => Promise<{ id: string } | null>;
  findOtherUserByPhone: (phone: string, userId: string) => Promise<{ id: string } | null>;
  deleteChallengesForUserAndType: (input: { userId: string; type: AccountContactChangeType }) => Promise<void>;
  createChallenge: (input: {
    userId: string;
    type: AccountContactChangeType;
    nextEmail?: string;
    nextPhone?: string;
    emailCodeHash: string;
    emailCodeExpiresAt: Date;
  }) => Promise<{ id: string }>;
  sendEmailCode: (input: { userId: string; to: string; subject: string; text: string }) => Promise<void>;
  now: () => Date;
  generateCode: () => string;
  hashValue: (value: string) => string;
  isSmsEnabled: () => boolean;
}

interface ActiveContactChangeUser {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  emailVerified: Date | null;
  phoneVerifiedAt: Date | null;
}

const defaultStartContactChangeDependencies: StartContactChangeDependencies = {
  findUserById: async (userId) => findActiveUserForAccountProfile(userId),
  findOtherUserByEmail: async (email, userId) => findActiveUserByEmailExcludingUser(email, userId),
  findOtherUserByPhone: async (phone, userId) => findActiveUserByPhoneExcludingUser(phone, userId),
  deleteChallengesForUserAndType: async (input) => deleteContactChangeChallengesForUserAndType(input),
  createChallenge: async (input) => createAccountContactChangeChallenge(input),
  sendEmailCode: async (input) => {
    await enqueueEmailNotification({
      userId: input.userId,
      to: input.to,
      subject: input.subject,
      text: input.text,
      metadata: {
        scope: "auth-account-contact-change",
        channel: "email",
      },
    });
  },
  now: () => new Date(),
  generateCode: generateNumericCode,
  hashValue,
  isSmsEnabled: () => env.UPPOINT_SMS_ENABLED,
};

export async function startAccountContactChangeChallenge(
  rawInput: unknown,
  dependencies: StartContactChangeDependencies = defaultStartContactChangeDependencies,
): Promise<{
  challengeId: string;
  emailCodeExpiresAt: Date;
  type: "EMAIL" | "PHONE";
  maskedEmail: string;
}> {
  const input = startContactChangeSchema.parse(rawInput);
  const locale = resolveLocale(input.locale);
  const now = dependencies.now();
  const expiresAt = toExpiresAt(now, CONTACT_CHANGE_CODE_TTL_MINUTES);
  const user = await dependencies.findUserById(input.userId);

  if (!user) {
    throw new AccountProfileError("PROFILE_NOT_FOUND", "Profile not found");
  }

  const emailCode = dependencies.generateCode();
  const emailCodeHash = dependencies.hashValue(emailCode);

  if (input.type === "EMAIL") {
    throw new AccountProfileError("EMAIL_CHANGE_DISABLED", "Email change is disabled");
  }

  if (!user.emailVerified) {
    throw new AccountProfileError("EMAIL_VERIFICATION_REQUIRED", "Email must be verified before phone change");
  }

  if (input.nextPhone === user.phone) {
    throw new AccountProfileError("PHONE_UNCHANGED", "Phone is unchanged");
  }

  if (!dependencies.isSmsEnabled()) {
    throw new AccountProfileError("SMS_NOT_ENABLED", "SMS service is not enabled");
  }

  const existingUser = await dependencies.findOtherUserByPhone(input.nextPhone, user.id);
  if (existingUser) {
    throw new AccountProfileError("PHONE_TAKEN", "Phone is already in use");
  }

  await dependencies.deleteChallengesForUserAndType({
    userId: user.id,
    type: AccountContactChangeType.PHONE,
  });

  const challenge = await dependencies.createChallenge({
    userId: user.id,
    type: AccountContactChangeType.PHONE,
    nextPhone: input.nextPhone,
    emailCodeHash,
    emailCodeExpiresAt: expiresAt,
  });

  const message = buildInitialEmailMessage({
    locale,
    name: user.name,
    code: emailCode,
    ttlMinutes: CONTACT_CHANGE_CODE_TTL_MINUTES,
    type: "PHONE",
  });

  await dependencies.sendEmailCode({
    userId: user.id,
    to: user.email,
    subject: message.subject,
    text: message.text,
  });

  return {
    challengeId: challenge.id,
    emailCodeExpiresAt: expiresAt,
    type: "PHONE",
    maskedEmail: maskEmail(user.email),
  };
}

interface VerifyContactChangeEmailDependencies {
  findChallengeById: (challengeId: string) => Promise<{
    id: string;
    userId: string;
    type: AccountContactChangeType;
    nextEmail: string | null;
    nextPhone: string | null;
    emailCodeHash: string;
    emailCodeExpiresAt: Date;
    emailCodeAttempts: number;
    emailCodeVerifiedAt: Date | null;
    user: {
      email: string;
      phone: string | null;
      emailVerified: Date | null;
      phoneVerifiedAt: Date | null;
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

const defaultVerifyContactChangeEmailDependencies: VerifyContactChangeEmailDependencies = {
  findChallengeById: async (challengeId) => findAccountContactChangeChallengeForEmailVerify(challengeId),
  incrementEmailAttempts: async (challengeId, maxAttempts) =>
    incrementAccountContactChangeEmailAttempts(challengeId, maxAttempts),
  markEmailVerifiedAndStoreSmsCode: async (input) =>
    markAccountContactChangeEmailVerifiedAndStoreSmsCode(input),
  sendSmsCode: async (input) => {
    await enqueueSmsNotification({
      userId: input.userId,
      to: input.to,
      message: input.text,
      metadata: {
        scope: "auth-account-contact-change",
        channel: "sms",
      },
    });
  },
  now: () => new Date(),
  generateCode: generateNumericCode,
  hashValue,
  isSmsEnabled: () => env.UPPOINT_SMS_ENABLED,
};

export async function verifyAccountContactChangeEmailCode(
  rawInput: unknown,
  dependencies: VerifyContactChangeEmailDependencies = defaultVerifyContactChangeEmailDependencies,
): Promise<{
  smsCodeExpiresAt: Date;
  maskedPhone: string;
  type: "EMAIL" | "PHONE";
}> {
  const input = verifyEmailCodeSchema.parse(rawInput);
  const locale = resolveLocale(input.locale);
  const now = dependencies.now();
  const challenge = await dependencies.findChallengeById(input.challengeId);

  if (!challenge || challenge.userId !== input.userId) {
    throw new AccountProfileError("INVALID_OR_EXPIRED_CHALLENGE", "Contact change challenge not found");
  }

  if (challenge.emailCodeAttempts >= CONTACT_CHANGE_MAX_ATTEMPTS) {
    throw new AccountProfileError("MAX_ATTEMPTS_REACHED", "Too many email verification attempts");
  }

  if (challenge.emailCodeVerifiedAt) {
    throw new AccountProfileError("INVALID_OR_EXPIRED_CHALLENGE", "Email code already used");
  }

  if (challenge.emailCodeExpiresAt <= now) {
    throw new AccountProfileError("INVALID_OR_EXPIRED_CHALLENGE", "Email code expired");
  }

  const providedCodeHash = dependencies.hashValue(input.emailCode);
  if (!timingSafeEqualHex(providedCodeHash, challenge.emailCodeHash)) {
    await dependencies.incrementEmailAttempts(challenge.id, CONTACT_CHANGE_MAX_ATTEMPTS);
    throw new AccountProfileError("INVALID_EMAIL_CODE", "Invalid email code");
  }

  if (!dependencies.isSmsEnabled()) {
    throw new AccountProfileError("SMS_NOT_ENABLED", "SMS service is not enabled");
  }

  const smsCode = dependencies.generateCode();
  const smsCodeHash = dependencies.hashValue(smsCode);
  const smsCodeExpiresAt = toExpiresAt(now, CONTACT_CHANGE_CODE_TTL_MINUTES);

  const smsTarget = challenge.type === AccountContactChangeType.EMAIL
    ? challenge.user.phone
    : challenge.nextPhone;

  if (!smsTarget) {
    throw new AccountProfileError("PHONE_NOT_AVAILABLE", "Phone number is required");
  }

  const marked = await dependencies.markEmailVerifiedAndStoreSmsCode({
    id: challenge.id,
    expectedEmailCodeHash: challenge.emailCodeHash,
    smsCodeHash,
    smsCodeExpiresAt,
    now,
    maxAttempts: CONTACT_CHANGE_MAX_ATTEMPTS,
  });

  if (!marked) {
    throw new AccountProfileError("INVALID_OR_EXPIRED_CHALLENGE", "Contact change email verification failed");
  }

  await dependencies.sendSmsCode({
    userId: challenge.userId,
    to: smsTarget,
    text: buildSmsVerificationMessage({
      locale,
      code: smsCode,
      ttlMinutes: CONTACT_CHANGE_CODE_TTL_MINUTES,
      type: challenge.type,
    }),
  });

  return {
    smsCodeExpiresAt,
    maskedPhone: maskPhone(smsTarget),
    type: challenge.type,
  };
}

interface VerifyContactChangeSmsDependencies {
  findChallengeById: (challengeId: string) => Promise<{
    id: string;
    userId: string;
    type: AccountContactChangeType;
    nextEmail: string | null;
    nextPhone: string | null;
    smsCodeHash: string | null;
    smsCodeExpiresAt: Date | null;
    smsCodeAttempts: number;
    smsCodeVerifiedAt: Date | null;
    emailCodeVerifiedAt: Date | null;
  } | null>;
  incrementSmsAttempts: (challengeId: string, maxAttempts: number) => Promise<number>;
  markSmsVerifiedAndStoreChangeToken: (input: {
    id: string;
    expectedSmsCodeHash: string;
    changeTokenHash: string;
    changeTokenExpiresAt: Date;
    now: Date;
    maxAttempts: number;
  }) => Promise<boolean>;
  now: () => Date;
  hashValue: (value: string) => string;
  generateChangeToken: () => string;
}

const defaultVerifyContactChangeSmsDependencies: VerifyContactChangeSmsDependencies = {
  findChallengeById: async (challengeId) => findAccountContactChangeChallengeForSmsVerify(challengeId),
  incrementSmsAttempts: async (challengeId, maxAttempts) =>
    incrementAccountContactChangeSmsAttempts(challengeId, maxAttempts),
  markSmsVerifiedAndStoreChangeToken: async (input) =>
    markAccountContactChangeSmsVerifiedAndStoreChangeToken(input),
  now: () => new Date(),
  hashValue,
  generateChangeToken,
};

export async function verifyAccountContactChangeSmsCode(
  rawInput: unknown,
  dependencies: VerifyContactChangeSmsDependencies = defaultVerifyContactChangeSmsDependencies,
): Promise<{ changeToken: string; type: "EMAIL" | "PHONE" }> {
  const input = verifySmsCodeSchema.parse(rawInput);
  const now = dependencies.now();
  const challenge = await dependencies.findChallengeById(input.challengeId);

  if (!challenge || challenge.userId !== input.userId) {
    throw new AccountProfileError("INVALID_OR_EXPIRED_CHALLENGE", "Contact change challenge not found");
  }

  if (!challenge.emailCodeVerifiedAt) {
    throw new AccountProfileError("CHANGE_TOKEN_NOT_READY", "Email verification must complete first");
  }

  if (challenge.smsCodeAttempts >= CONTACT_CHANGE_MAX_ATTEMPTS) {
    throw new AccountProfileError("MAX_ATTEMPTS_REACHED", "Too many SMS verification attempts");
  }

  if (challenge.smsCodeVerifiedAt) {
    throw new AccountProfileError("INVALID_OR_EXPIRED_CHALLENGE", "SMS code already used");
  }

  if (!challenge.smsCodeHash || !challenge.smsCodeExpiresAt || challenge.smsCodeExpiresAt <= now) {
    throw new AccountProfileError("INVALID_OR_EXPIRED_CHALLENGE", "SMS code expired");
  }

  const providedCodeHash = dependencies.hashValue(input.smsCode);
  if (!timingSafeEqualHex(providedCodeHash, challenge.smsCodeHash)) {
    await dependencies.incrementSmsAttempts(challenge.id, CONTACT_CHANGE_MAX_ATTEMPTS);
    throw new AccountProfileError("INVALID_SMS_CODE", "Invalid SMS code");
  }

  const changeToken = dependencies.generateChangeToken();
  const changeTokenHash = dependencies.hashValue(changeToken);
  const changeTokenExpiresAt = toExpiresAt(now, CONTACT_CHANGE_TOKEN_TTL_MINUTES);

  const marked = await dependencies.markSmsVerifiedAndStoreChangeToken({
    id: challenge.id,
    expectedSmsCodeHash: challenge.smsCodeHash,
    changeTokenHash,
    changeTokenExpiresAt,
    now,
    maxAttempts: CONTACT_CHANGE_MAX_ATTEMPTS,
  });

  if (!marked) {
    throw new AccountProfileError("INVALID_OR_EXPIRED_CHALLENGE", "Contact change SMS verification failed");
  }

  return {
    changeToken,
    type: challenge.type,
  };
}

interface CompleteContactChangeDependencies {
  findChallengeById: (challengeId: string) => Promise<{
    id: string;
    userId: string;
    type: AccountContactChangeType;
    nextEmail: string | null;
    nextPhone: string | null;
    smsCodeVerifiedAt: Date | null;
    changeTokenHash: string | null;
    changeTokenExpiresAt: Date | null;
    changeTokenUsedAt: Date | null;
  } | null>;
  hashValue: (value: string) => string;
  completeChange: (input: {
    challengeId: string;
    userId: string;
    expectedChangeTokenHash: string;
    nextEmail?: string;
    nextPhone?: string;
    now: Date;
  }) => Promise<"SUCCESS" | "TARGET_TAKEN" | "INVALID_CHALLENGE">;
  now: () => Date;
}

const defaultCompleteContactChangeDependencies: CompleteContactChangeDependencies = {
  findChallengeById: async (challengeId) => findAccountContactChangeChallengeForComplete(challengeId),
  hashValue,
  completeChange: async (input) => completeAccountContactChange(input),
  now: () => new Date(),
};

export async function completeAccountContactChangeChallenge(
  rawInput: unknown,
  dependencies: CompleteContactChangeDependencies = defaultCompleteContactChangeDependencies,
): Promise<{
  userId: string;
  type: "EMAIL" | "PHONE";
  updatedValue: string;
}> {
  const input = completeContactChangeSchema.parse(rawInput);
  const now = dependencies.now();
  const challenge = await dependencies.findChallengeById(input.challengeId);

  if (!challenge || challenge.userId !== input.userId) {
    throw new AccountProfileError("INVALID_OR_EXPIRED_CHALLENGE", "Contact change challenge not found");
  }

  if (!challenge.smsCodeVerifiedAt) {
    throw new AccountProfileError("CHANGE_TOKEN_NOT_READY", "SMS verification must complete first");
  }

  if (!challenge.changeTokenHash || !challenge.changeTokenExpiresAt || challenge.changeTokenExpiresAt <= now) {
    throw new AccountProfileError("INVALID_OR_EXPIRED_CHANGE_TOKEN", "Change token expired");
  }

  if (challenge.changeTokenUsedAt) {
    throw new AccountProfileError("INVALID_OR_EXPIRED_CHANGE_TOKEN", "Change token already used");
  }

  const providedChangeTokenHash = dependencies.hashValue(input.changeToken);
  if (!timingSafeEqualHex(providedChangeTokenHash, challenge.changeTokenHash)) {
    throw new AccountProfileError("INVALID_OR_EXPIRED_CHANGE_TOKEN", "Invalid change token");
  }

  const outcome = await dependencies.completeChange({
    challengeId: challenge.id,
    userId: challenge.userId,
    expectedChangeTokenHash: challenge.changeTokenHash,
    nextEmail: challenge.type === AccountContactChangeType.EMAIL ? (challenge.nextEmail ?? undefined) : undefined,
    nextPhone: challenge.type === AccountContactChangeType.PHONE ? (challenge.nextPhone ?? undefined) : undefined,
    now,
  });

  if (outcome === "INVALID_CHALLENGE") {
    throw new AccountProfileError("INVALID_OR_EXPIRED_CHANGE_TOKEN", "Change token could not be consumed");
  }

  if (outcome === "TARGET_TAKEN") {
    throw new AccountProfileError(
      challenge.type === AccountContactChangeType.EMAIL ? "EMAIL_TAKEN" : "PHONE_TAKEN",
      "Target contact value already exists",
    );
  }

  const updatedValue = challenge.type === AccountContactChangeType.EMAIL ? challenge.nextEmail : challenge.nextPhone;
  if (!updatedValue) {
    throw new AccountProfileError("INVALID_OR_EXPIRED_CHALLENGE", "Contact change target is missing");
  }

  return {
    userId: challenge.userId,
    type: challenge.type,
    updatedValue,
  };
}

import "server-only";

import crypto from "crypto";
import { z } from "zod";

import { prisma } from "@/db/client";
import { env } from "@/lib/env/server";
import { defaultLocale, isLocale, type Locale } from "@/modules/i18n/config";
import { withLocale } from "@/modules/i18n/paths";
import { registerSchema } from "@/modules/auth/schemas/auth-schemas";

import { sendAuthEmail } from "./email-service";
import { hashPassword } from "./password";

const requestPasswordResetSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  locale: z.string().optional(),
});

const completePasswordResetSchema = z.object({
  token: z.string().trim().min(32).max(512),
  password: registerSchema.shape.password,
});

function resolveLocale(value: string | undefined): Locale {
  if (value && isLocale(value)) {
    return value;
  }

  return defaultLocale;
}

export function hashPasswordResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function buildPasswordResetUrl(token: string, locale: Locale): string {
  const url = new URL(withLocale("/reset-password", locale), env.NEXT_PUBLIC_APP_URL);
  url.searchParams.set("token", token);
  return url.toString();
}

function buildPasswordResetEmail(options: {
  locale: Locale;
  resetUrl: string;
  ttlMinutes: number;
  name: string | null;
}) {
  const displayName = options.name?.trim() || "User";

  if (options.locale === "tr") {
    return {
      subject: "Uppoint Cloud şifre sıfırlama bağlantısı",
      text:
        `Merhaba ${displayName},\n\n` +
        "Şifreni sıfırlamak için aşağıdaki bağlantıyı kullan:\n" +
        `${options.resetUrl}\n\n` +
        `Bu bağlantı ${options.ttlMinutes} dakika içinde geçerliliğini kaybeder.\n` +
        "Eğer bu talebi sen yapmadıysan bu e-postayı yok sayabilirsin.",
    };
  }

  return {
    subject: "Uppoint Cloud password reset link",
    text:
      `Hello ${displayName},\n\n` +
      "Use the link below to reset your password:\n" +
      `${options.resetUrl}\n\n` +
      `This link expires in ${options.ttlMinutes} minutes.\n` +
      "If you did not request this, you can ignore this email.",
  };
}

interface RequestPasswordResetDependencies {
  findUserByEmail: (email: string) => Promise<{ id: string; email: string; name: string | null } | null>;
  deleteTokensForUser: (userId: string) => Promise<void>;
  createToken: (input: { userId: string; tokenHash: string; expiresAt: Date }) => Promise<void>;
  sendResetEmail: (input: {
    to: string;
    locale: Locale;
    name: string | null;
    resetUrl: string;
    ttlMinutes: number;
  }) => Promise<void>;
  now: () => Date;
  generateToken: () => string;
  hashToken: (token: string) => string;
  buildResetUrl: (token: string, locale: Locale) => string;
}

const defaultRequestDependencies: RequestPasswordResetDependencies = {
  findUserByEmail: async (email) =>
    prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    }),
  deleteTokensForUser: async (userId) => {
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
  },
  createToken: async (input) => {
    await prisma.passwordResetToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      },
    });
  },
  sendResetEmail: async (input) => {
    const email = buildPasswordResetEmail({
      locale: input.locale,
      resetUrl: input.resetUrl,
      ttlMinutes: input.ttlMinutes,
      name: input.name,
    });

    await sendAuthEmail({
      to: input.to,
      subject: email.subject,
      text: email.text,
    });
  },
  now: () => new Date(),
  generateToken: () => crypto.randomBytes(32).toString("hex"),
  hashToken: hashPasswordResetToken,
  buildResetUrl: buildPasswordResetUrl,
};

export async function requestPasswordReset(
  rawInput: unknown,
  dependencies: RequestPasswordResetDependencies = defaultRequestDependencies,
): Promise<void> {
  const input = requestPasswordResetSchema.parse(rawInput);
  const locale = resolveLocale(input.locale);
  const user = await dependencies.findUserByEmail(input.email);

  // Security-sensitive: we intentionally return success for unknown emails to prevent account enumeration.
  if (!user) {
    return;
  }

  const now = dependencies.now();
  const ttlMinutes = env.AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES;
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
  const rawToken = dependencies.generateToken();
  const tokenHash = dependencies.hashToken(rawToken);

  await dependencies.deleteTokensForUser(user.id);
  await dependencies.createToken({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  const resetUrl = dependencies.buildResetUrl(rawToken, locale);

  await dependencies.sendResetEmail({
    to: user.email,
    locale,
    name: user.name,
    resetUrl,
    ttlMinutes,
  });
}

export class PasswordResetError extends Error {
  constructor(
    public readonly code: "INVALID_OR_EXPIRED_TOKEN" | "UNKNOWN",
    message: string,
  ) {
    super(message);
    this.name = "PasswordResetError";
  }
}

interface CompletePasswordResetDependencies {
  findTokenByHash: (tokenHash: string) => Promise<{
    id: string;
    userId: string;
    expiresAt: Date;
    usedAt: Date | null;
  } | null>;
  hashPassword: (password: string) => Promise<string>;
  consumeTokenAndUpdatePassword: (input: {
    tokenId: string;
    userId: string;
    passwordHash: string;
    now: Date;
  }) => Promise<void>;
  hashToken: (token: string) => string;
  now: () => Date;
}

const defaultCompleteDependencies: CompletePasswordResetDependencies = {
  findTokenByHash: async (tokenHash) =>
    prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
      },
    }),
  hashPassword: async (password) => hashPassword(password, env.AUTH_BCRYPT_ROUNDS),
  consumeTokenAndUpdatePassword: async (input) => {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: input.userId },
        data: { passwordHash: input.passwordHash },
      });

      await tx.passwordResetToken.update({
        where: { id: input.tokenId },
        data: { usedAt: input.now },
      });

      await tx.passwordResetToken.deleteMany({
        where: {
          userId: input.userId,
          id: { not: input.tokenId },
        },
      });

      await tx.session.deleteMany({
        where: { userId: input.userId },
      });
    });
  },
  hashToken: hashPasswordResetToken,
  now: () => new Date(),
};

export async function completePasswordReset(
  rawInput: unknown,
  dependencies: CompletePasswordResetDependencies = defaultCompleteDependencies,
): Promise<void> {
  const input = completePasswordResetSchema.parse(rawInput);
  const now = dependencies.now();
  const tokenHash = dependencies.hashToken(input.token);
  const tokenRecord = await dependencies.findTokenByHash(tokenHash);

  if (!tokenRecord || tokenRecord.usedAt || tokenRecord.expiresAt <= now) {
    throw new PasswordResetError(
      "INVALID_OR_EXPIRED_TOKEN",
      "Reset token is invalid or expired",
    );
  }

  const newPasswordHash = await dependencies.hashPassword(input.password);

  try {
    await dependencies.consumeTokenAndUpdatePassword({
      tokenId: tokenRecord.id,
      userId: tokenRecord.userId,
      passwordHash: newPasswordHash,
      now,
    });
  } catch (error) {
    if (error instanceof PasswordResetError) {
      throw error;
    }

    throw new PasswordResetError("UNKNOWN", "Unable to reset password");
  }
}

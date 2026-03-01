import "server-only";

import crypto from "crypto";

import { prisma } from "@/db/client";
import { env } from "@/lib/env";
import { defaultLocale, isLocale } from "@/modules/i18n/config";
import { withLocale } from "@/modules/i18n/paths";

import { sendAuthEmail } from "./email-service";

const TOKEN_TTL_HOURS = 24;

export class EmailVerificationError extends Error {
  constructor(
    public readonly code: "INVALID_OR_EXPIRED_TOKEN" | "USER_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "EmailVerificationError";
  }
}

export async function createAndSendEmailVerificationToken(
  email: string,
  locale: string,
): Promise<void> {
  const rawToken = crypto.randomBytes(32).toString("hex");
  // Hash before storing so a DB breach cannot be used to verify arbitrary accounts.
  // The raw token is sent in the email URL; only its SHA-256 hash lives in the DB.
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1_000);

  // Replace any existing verification token for this email
  await prisma.verificationToken.deleteMany({ where: { identifier: email } });
  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token: tokenHash,
      expires: expiresAt,
    },
  });

  if (env.UPPOINT_EMAIL_BACKEND !== "disabled") {
    const resolvedLocale = isLocale(locale) ? locale : defaultLocale;
    const verifyUrl = new URL(withLocale("/verify-email", resolvedLocale), env.NEXT_PUBLIC_APP_URL);
    // Security-sensitive: use URL fragment so raw token is not sent in server/access logs.
    verifyUrl.hash = new URLSearchParams({ token: rawToken }).toString();

    await sendAuthEmail({
      to: email,
      subject: "Verify your Uppoint Cloud email address",
      text: [
        "Please verify your Uppoint Cloud email address by clicking the link below:",
        "",
        verifyUrl.toString(),
        "",
        `This link expires in ${TOKEN_TTL_HOURS} hours. If you did not create this account, you can safely ignore this email.`,
      ].join("\n"),
    });
  }
}

export async function verifyEmailToken(rawToken: string): Promise<void> {
  // Hash the incoming raw token to match the stored hash.
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const tokenRecord = await prisma.verificationToken.findUnique({
    where: { token: tokenHash },
  });

  if (!tokenRecord || tokenRecord.expires < new Date()) {
    throw new EmailVerificationError(
      "INVALID_OR_EXPIRED_TOKEN",
      "Token is invalid or expired",
    );
  }

  const user = await prisma.user.findFirst({
    where: {
      email: tokenRecord.identifier,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!user) {
    throw new EmailVerificationError("USER_NOT_FOUND", "User not found");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    }),
    prisma.verificationToken.delete({
      where: { token: tokenHash },
    }),
  ]);
}

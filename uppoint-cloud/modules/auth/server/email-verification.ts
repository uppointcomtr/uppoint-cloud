import "server-only";

import crypto from "crypto";

import { prisma } from "@/db/client";
import { env } from "@/lib/env/server";

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
  baseUrl: string,
): Promise<void> {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1_000);

  // Replace any existing verification token for this email
  await prisma.verificationToken.deleteMany({ where: { identifier: email } });
  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token: rawToken,
      expires: expiresAt,
    },
  });

  if (env.UPPOINT_EMAIL_BACKEND !== "disabled") {
    const verifyUrl = `${baseUrl}/${locale}/verify-email?token=${rawToken}`;
    await sendAuthEmail({
      to: email,
      subject: "Verify your Uppoint Cloud email address",
      text: [
        "Please verify your Uppoint Cloud email address by clicking the link below:",
        "",
        verifyUrl,
        "",
        `This link expires in ${TOKEN_TTL_HOURS} hours. If you did not create this account, you can safely ignore this email.`,
      ].join("\n"),
    });
  }
}

export async function verifyEmailToken(rawToken: string): Promise<void> {
  const tokenRecord = await prisma.verificationToken.findUnique({
    where: { token: rawToken },
  });

  if (!tokenRecord || tokenRecord.expires < new Date()) {
    throw new EmailVerificationError(
      "INVALID_OR_EXPIRED_TOKEN",
      "Token is invalid or expired",
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: tokenRecord.identifier },
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
      where: { token: rawToken },
    }),
  ]);
}

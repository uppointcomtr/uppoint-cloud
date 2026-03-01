import "server-only";

import crypto from "crypto";

import { prisma } from "@/db/client";

export class EmailVerificationError extends Error {
  constructor(
    public readonly code: "INVALID_OR_EXPIRED_TOKEN" | "USER_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "EmailVerificationError";
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

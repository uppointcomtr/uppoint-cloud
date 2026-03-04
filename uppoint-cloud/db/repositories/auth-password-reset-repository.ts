import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/db/client";

type AuthPasswordResetRepositoryClient = Prisma.TransactionClient | typeof prisma;

export async function findActiveUserByEmailForPasswordReset(
  email: string,
  client: AuthPasswordResetRepositoryClient = prisma,
): Promise<{ id: string; email: string; phone: string | null; name: string | null } | null> {
  return client.user.findFirst({
    where: { email, deletedAt: null },
    select: { id: true, email: true, phone: true, name: true },
  });
}

export async function deletePasswordResetChallengesForUser(
  userId: string,
  client: AuthPasswordResetRepositoryClient = prisma,
): Promise<void> {
  await client.passwordResetChallenge.deleteMany({ where: { userId } });
}

export async function createPasswordResetChallenge(
  input: { userId: string; emailCodeHash: string; emailCodeExpiresAt: Date },
  client: AuthPasswordResetRepositoryClient = prisma,
): Promise<{ id: string }> {
  return client.passwordResetChallenge.create({
    data: {
      userId: input.userId,
      emailCodeHash: input.emailCodeHash,
      emailCodeExpiresAt: input.emailCodeExpiresAt,
    },
    select: { id: true },
  });
}

export async function findPasswordResetChallengeForEmailVerify(
  id: string,
  client: AuthPasswordResetRepositoryClient = prisma,
): Promise<{
  id: string;
  userId: string;
  emailCodeHash: string;
  emailCodeExpiresAt: Date;
  emailCodeAttempts: number;
  emailCodeVerifiedAt: Date | null;
  user: {
    phone: string | null;
  };
} | null> {
  return client.passwordResetChallenge.findUnique({
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
  });
}

export async function incrementPasswordResetEmailAttempts(
  id: string,
  maxAttempts: number,
  client: AuthPasswordResetRepositoryClient = prisma,
): Promise<number> {
  const result = await client.passwordResetChallenge.updateMany({
    where: {
      id,
      emailCodeAttempts: {
        lt: maxAttempts,
      },
    },
    data: {
      emailCodeAttempts: {
        increment: 1,
      },
    },
  });
  return result.count;
}

export async function markPasswordResetEmailVerifiedAndStoreSmsCode(
  input: {
    id: string;
    expectedEmailCodeHash: string;
    smsCodeHash: string;
    smsCodeExpiresAt: Date;
    now: Date;
    maxAttempts: number;
  },
  client: AuthPasswordResetRepositoryClient = prisma,
): Promise<boolean> {
  const result = await client.passwordResetChallenge.updateMany({
    where: {
      id: input.id,
      emailCodeHash: input.expectedEmailCodeHash,
      emailCodeAttempts: {
        lt: input.maxAttempts,
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
}

export async function findPasswordResetChallengeForSmsVerify(
  id: string,
  client: AuthPasswordResetRepositoryClient = prisma,
): Promise<{
  id: string;
  userId: string;
  smsCodeHash: string | null;
  smsCodeExpiresAt: Date | null;
  smsCodeAttempts: number;
  smsCodeVerifiedAt: Date | null;
  emailCodeVerifiedAt: Date | null;
} | null> {
  return client.passwordResetChallenge.findUnique({
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
  });
}

export async function incrementPasswordResetSmsAttempts(
  id: string,
  maxAttempts: number,
  client: AuthPasswordResetRepositoryClient = prisma,
): Promise<number> {
  const result = await client.passwordResetChallenge.updateMany({
    where: {
      id,
      smsCodeAttempts: {
        lt: maxAttempts,
      },
    },
    data: {
      smsCodeAttempts: {
        increment: 1,
      },
    },
  });
  return result.count;
}

export async function markPasswordResetSmsVerifiedAndStoreResetToken(
  input: {
    id: string;
    expectedSmsCodeHash: string;
    resetTokenHash: string;
    resetTokenExpiresAt: Date;
    now: Date;
    maxAttempts: number;
  },
  client: AuthPasswordResetRepositoryClient = prisma,
): Promise<boolean> {
  const result = await client.passwordResetChallenge.updateMany({
    where: {
      id: input.id,
      smsCodeHash: input.expectedSmsCodeHash,
      smsCodeAttempts: {
        lt: input.maxAttempts,
      },
      smsCodeExpiresAt: {
        gt: input.now,
      },
      smsCodeVerifiedAt: null,
      emailCodeVerifiedAt: {
        not: null,
      },
    },
    data: {
      smsCodeVerifiedAt: input.now,
      resetTokenHash: input.resetTokenHash,
      resetTokenExpiresAt: input.resetTokenExpiresAt,
      resetTokenUsedAt: null,
    },
  });
  return result.count === 1;
}

export async function findPasswordResetChallengeForComplete(
  id: string,
  client: AuthPasswordResetRepositoryClient = prisma,
): Promise<{
  id: string;
  userId: string;
  smsCodeVerifiedAt: Date | null;
  resetTokenHash: string | null;
  resetTokenExpiresAt: Date | null;
  resetTokenUsedAt: Date | null;
} | null> {
  return client.passwordResetChallenge.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      smsCodeVerifiedAt: true,
      resetTokenHash: true,
      resetTokenExpiresAt: true,
      resetTokenUsedAt: true,
    },
  });
}

export async function completePasswordResetAndCleanup(
  input: {
    challengeId: string;
    userId: string;
    expectedResetTokenHash: string;
    passwordHash: string;
    now: Date;
  },
  client: typeof prisma = prisma,
): Promise<boolean> {
  return client.$transaction(async (tx) => {
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

    const updatedUser = await tx.user.updateMany({
      where: {
        id: input.userId,
        deletedAt: null,
      },
      data: {
        passwordHash: input.passwordHash,
        tokenVersion: {
          increment: 1,
        },
      },
    });

    if (updatedUser.count !== 1) {
      throw new Error("PASSWORD_RESET_USER_NOT_ACTIVE");
    }

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
}

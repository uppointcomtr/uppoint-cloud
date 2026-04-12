import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/db/client";

type AuthLoginRepositoryClient = Prisma.TransactionClient | typeof prisma;

export async function registerFailedPasswordAttemptAtomic(
  input: { userId: string; now: Date; maxAttempts: number; lockUntil: Date },
  client: AuthLoginRepositoryClient = prisma,
): Promise<void> {
  // Security-sensitive: single SQL update avoids read-modify-write races under concurrent failures.
  await client.$executeRaw`
    UPDATE "User"
    SET
      "failedLoginAttempts" = "failedLoginAttempts" + 1,
      "lockedUntil" = CASE
        WHEN ("failedLoginAttempts" + 1) >= ${input.maxAttempts} THEN ${input.lockUntil}
        ELSE "lockedUntil"
      END
    WHERE "id" = ${input.userId}
      AND "deletedAt" IS NULL
  `;
}

export async function findActiveUserByEmailForLogin(
  email: string,
  client: AuthLoginRepositoryClient = prisma,
): Promise<{
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  emailVerified: Date | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
} | null> {
  return client.user.findFirst({
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
  });
}

export async function findActiveUserByPhoneForLogin(
  phone: string,
  client: AuthLoginRepositoryClient = prisma,
): Promise<{
  id: string;
  phone: string;
  passwordHash: string;
  emailVerified: Date | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
} | null> {
  const user = await client.user.findFirst({
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
}

export async function findActiveUserSessionSnapshot(
  userId: string,
  client: AuthLoginRepositoryClient = prisma,
): Promise<{
  tokenVersion: number;
  email: string;
  name: string | null;
} | null> {
  return client.user.findFirst({
    where: {
      id: userId,
      deletedAt: null,
    },
    select: {
      tokenVersion: true,
      email: true,
      name: true,
    },
  });
}

export async function clearFailedLoginAttempts(
  userId: string,
  client: AuthLoginRepositoryClient = prisma,
): Promise<void> {
  await client.user.updateMany({
    where: {
      id: userId,
      deletedAt: null,
    },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
}

export async function deleteLoginChallengesForUserAndMode(
  userId: string,
  mode: "email" | "phone",
  client: AuthLoginRepositoryClient = prisma,
): Promise<void> {
  await client.loginChallenge.deleteMany({ where: { userId, mode } });
}

export async function createLoginChallenge(
  input: {
    userId: string;
    mode: "email" | "phone";
    codeHash: string;
    codeExpiresAt: Date;
  },
  client: AuthLoginRepositoryClient = prisma,
): Promise<{ id: string }> {
  return client.loginChallenge.create({
    data: {
      userId: input.userId,
      mode: input.mode,
      codeHash: input.codeHash,
      codeExpiresAt: input.codeExpiresAt,
    },
    select: { id: true },
  });
}

export async function findLoginChallengeById(
  id: string,
  client: AuthLoginRepositoryClient = prisma,
): Promise<{
  id: string;
  userId: string;
  mode: string;
  codeHash: string;
  codeExpiresAt: Date;
  codeAttempts: number;
  verifiedAt: Date | null;
} | null> {
  return client.loginChallenge.findUnique({
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
  });
}

export async function incrementLoginChallengeAttempts(
  id: string,
  maxAttempts: number,
  client: AuthLoginRepositoryClient = prisma,
): Promise<number> {
  const result = await client.loginChallenge.updateMany({
    where: {
      id,
      codeAttempts: {
        lt: maxAttempts,
      },
    },
    data: {
      codeAttempts: {
        increment: 1,
      },
    },
  });
  return result.count;
}

export async function markLoginChallengeVerifiedAndStoreToken(
  input: {
    id: string;
    mode: "email" | "phone";
    expectedCodeHash: string;
    maxAttempts: number;
    loginTokenHash: string;
    loginTokenExpiresAt: Date;
    now: Date;
  },
  client: AuthLoginRepositoryClient = prisma,
): Promise<boolean> {
  const result = await client.loginChallenge.updateMany({
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
}

export async function findLoginChallengeByTokenHash(
  tokenHash: string,
  client: AuthLoginRepositoryClient = prisma,
): Promise<{
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
} | null> {
  return client.loginChallenge.findFirst({
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
  });
}

export async function consumeLoginTokenAndCleanupChallenges(
  input: {
    challengeId: string;
    userId: string;
    tokenHash: string;
    now: Date;
  },
  client: typeof prisma = prisma,
): Promise<boolean> {
  return client.$transaction(async (tx) => {
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

    const updatedUser = await tx.user.updateMany({
      where: {
        id: input.userId,
        deletedAt: null,
      },
      data: {
        lastLoginAt: input.now,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    if (updatedUser.count !== 1) {
      throw new Error("LOGIN_TOKEN_USER_NOT_ACTIVE");
    }

    await tx.loginChallenge.deleteMany({
      where: {
        userId: input.userId,
        id: { not: input.challengeId },
      },
    });

    return true;
  });
}

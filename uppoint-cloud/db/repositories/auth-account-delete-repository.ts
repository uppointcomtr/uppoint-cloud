import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/db/client";
import { softDeleteUserWithCleanup } from "@/db/repositories/auth-user-repository";

type AuthAccountDeleteRepositoryClient = Prisma.TransactionClient | typeof prisma;

export async function findActiveUserByIdForAccountDelete(
  userId: string,
  client: AuthAccountDeleteRepositoryClient = prisma,
): Promise<{ id: string; email: string; phone: string | null; name: string | null } | null> {
  return client.user.findFirst({
    where: {
      id: userId,
      deletedAt: null,
    },
    select: {
      id: true,
      email: true,
      phone: true,
      name: true,
    },
  });
}

export async function deleteAccountDeleteChallengesForUser(
  userId: string,
  client: AuthAccountDeleteRepositoryClient = prisma,
): Promise<void> {
  await client.accountDeleteChallenge.deleteMany({
    where: { userId },
  });
}

export async function createAccountDeleteChallenge(
  input: { userId: string; emailCodeHash: string; emailCodeExpiresAt: Date },
  client: AuthAccountDeleteRepositoryClient = prisma,
): Promise<{ id: string }> {
  return client.accountDeleteChallenge.create({
    data: {
      userId: input.userId,
      emailCodeHash: input.emailCodeHash,
      emailCodeExpiresAt: input.emailCodeExpiresAt,
    },
    select: { id: true },
  });
}

export async function findAccountDeleteChallengeForEmailVerify(
  id: string,
  client: AuthAccountDeleteRepositoryClient = prisma,
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
  return client.accountDeleteChallenge.findUnique({
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

export async function incrementAccountDeleteEmailAttempts(
  id: string,
  maxAttempts: number,
  client: AuthAccountDeleteRepositoryClient = prisma,
): Promise<number> {
  const result = await client.accountDeleteChallenge.updateMany({
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

export async function markAccountDeleteEmailVerifiedAndStoreSmsCode(
  input: {
    id: string;
    expectedEmailCodeHash: string;
    smsCodeHash: string;
    smsCodeExpiresAt: Date;
    now: Date;
    maxAttempts: number;
  },
  client: AuthAccountDeleteRepositoryClient = prisma,
): Promise<boolean> {
  const result = await client.accountDeleteChallenge.updateMany({
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

export async function findAccountDeleteChallengeForSmsVerify(
  id: string,
  client: AuthAccountDeleteRepositoryClient = prisma,
): Promise<{
  id: string;
  userId: string;
  smsCodeHash: string | null;
  smsCodeExpiresAt: Date | null;
  smsCodeAttempts: number;
  smsCodeVerifiedAt: Date | null;
  emailCodeVerifiedAt: Date | null;
} | null> {
  return client.accountDeleteChallenge.findUnique({
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

export async function incrementAccountDeleteSmsAttempts(
  id: string,
  maxAttempts: number,
  client: AuthAccountDeleteRepositoryClient = prisma,
): Promise<number> {
  const result = await client.accountDeleteChallenge.updateMany({
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

export async function markAccountDeleteSmsVerifiedAndStoreDeleteToken(
  input: {
    id: string;
    expectedSmsCodeHash: string;
    deleteTokenHash: string;
    deleteTokenExpiresAt: Date;
    now: Date;
    maxAttempts: number;
  },
  client: AuthAccountDeleteRepositoryClient = prisma,
): Promise<boolean> {
  const result = await client.accountDeleteChallenge.updateMany({
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
      deleteTokenHash: input.deleteTokenHash,
      deleteTokenExpiresAt: input.deleteTokenExpiresAt,
      deleteTokenUsedAt: null,
    },
  });

  return result.count === 1;
}

export async function findAccountDeleteChallengeForComplete(
  id: string,
  client: AuthAccountDeleteRepositoryClient = prisma,
): Promise<{
  id: string;
  userId: string;
  smsCodeVerifiedAt: Date | null;
  deleteTokenHash: string | null;
  deleteTokenExpiresAt: Date | null;
  deleteTokenUsedAt: Date | null;
} | null> {
  return client.accountDeleteChallenge.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      smsCodeVerifiedAt: true,
      deleteTokenHash: true,
      deleteTokenExpiresAt: true,
      deleteTokenUsedAt: true,
    },
  });
}

export async function completeAccountDeleteAndCleanup(
  input: {
    challengeId: string;
    userId: string;
    expectedDeleteTokenHash: string;
    now: Date;
  },
  client: typeof prisma = prisma,
): Promise<boolean> {
  return client.$transaction(async (tx) => {
    const consumed = await tx.accountDeleteChallenge.updateMany({
      where: {
        id: input.challengeId,
        userId: input.userId,
        smsCodeVerifiedAt: {
          not: null,
        },
        deleteTokenHash: input.expectedDeleteTokenHash,
        deleteTokenExpiresAt: {
          gt: input.now,
        },
        deleteTokenUsedAt: null,
      },
      data: {
        deleteTokenUsedAt: input.now,
      },
    });

    if (consumed.count !== 1) {
      return false;
    }

    const tombstoneEmail = `deleted+${input.userId}@deleted.invalid`;
    const deleted = await softDeleteUserWithCleanup({
      userId: input.userId,
      now: input.now,
      tombstoneEmail,
    }, tx);

    if (!deleted) {
      throw new Error("ACCOUNT_DELETE_USER_NOT_ACTIVE");
    }

    return true;
  });
}

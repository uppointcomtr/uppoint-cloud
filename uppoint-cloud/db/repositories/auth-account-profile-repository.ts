import "server-only";

import { AccountContactChangeType, Prisma } from "@prisma/client";

import { prisma } from "@/db/client";

type AuthAccountProfileRepositoryClient = Prisma.TransactionClient | typeof prisma;

export interface ActiveAccountProfileUser {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  emailVerified: Date | null;
  phoneVerifiedAt: Date | null;
}

export async function findActiveUserForAccountProfile(
  userId: string,
  client: AuthAccountProfileRepositoryClient = prisma,
): Promise<ActiveAccountProfileUser | null> {
  return client.user.findFirst({
    where: {
      id: userId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      emailVerified: true,
      phoneVerifiedAt: true,
    },
  });
}

export async function findActiveUserByEmailExcludingUser(
  email: string,
  userId: string,
  client: AuthAccountProfileRepositoryClient = prisma,
): Promise<{ id: string } | null> {
  return client.user.findFirst({
    where: {
      email,
      deletedAt: null,
      id: {
        not: userId,
      },
    },
    select: {
      id: true,
    },
  });
}

export async function findActiveUserByPhoneExcludingUser(
  phone: string,
  userId: string,
  client: AuthAccountProfileRepositoryClient = prisma,
): Promise<{ id: string } | null> {
  return client.user.findFirst({
    where: {
      phone,
      deletedAt: null,
      id: {
        not: userId,
      },
    },
    select: {
      id: true,
    },
  });
}

export async function updateActiveUserName(
  input: { userId: string; name: string },
  client: AuthAccountProfileRepositoryClient = prisma,
): Promise<{ id: string; name: string; email: string } | null> {
  const updated = await client.user.updateMany({
    where: {
      id: input.userId,
      deletedAt: null,
    },
    data: {
      name: input.name,
    },
  });

  if (updated.count !== 1) {
    return null;
  }

  return client.user.findFirst({
    where: {
      id: input.userId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  }) as Promise<{ id: string; name: string; email: string } | null>;
}

export async function deleteContactChangeChallengesForUserAndType(
  input: { userId: string; type: AccountContactChangeType },
  client: AuthAccountProfileRepositoryClient = prisma,
): Promise<void> {
  await client.accountContactChangeChallenge.deleteMany({
    where: {
      userId: input.userId,
      type: input.type,
    },
  });
}

export async function createAccountContactChangeChallenge(
  input: {
    userId: string;
    type: AccountContactChangeType;
    nextEmail?: string;
    nextPhone?: string;
    emailCodeHash: string;
    emailCodeExpiresAt: Date;
  },
  client: AuthAccountProfileRepositoryClient = prisma,
): Promise<{ id: string }> {
  return client.accountContactChangeChallenge.create({
    data: {
      userId: input.userId,
      type: input.type,
      nextEmail: input.nextEmail,
      nextPhone: input.nextPhone,
      emailCodeHash: input.emailCodeHash,
      emailCodeExpiresAt: input.emailCodeExpiresAt,
    },
    select: {
      id: true,
    },
  });
}

export async function findAccountContactChangeChallengeForEmailVerify(
  id: string,
  client: AuthAccountProfileRepositoryClient = prisma,
): Promise<{
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
} | null> {
  return client.accountContactChangeChallenge.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      type: true,
      nextEmail: true,
      nextPhone: true,
      emailCodeHash: true,
      emailCodeExpiresAt: true,
      emailCodeAttempts: true,
      emailCodeVerifiedAt: true,
      user: {
        select: {
          email: true,
          phone: true,
          emailVerified: true,
          phoneVerifiedAt: true,
        },
      },
    },
  });
}

export async function incrementAccountContactChangeEmailAttempts(
  id: string,
  maxAttempts: number,
  client: AuthAccountProfileRepositoryClient = prisma,
): Promise<number> {
  const result = await client.accountContactChangeChallenge.updateMany({
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

export async function markAccountContactChangeEmailVerifiedAndStoreSmsCode(
  input: {
    id: string;
    expectedEmailCodeHash: string;
    smsCodeHash: string;
    smsCodeExpiresAt: Date;
    now: Date;
    maxAttempts: number;
  },
  client: AuthAccountProfileRepositoryClient = prisma,
): Promise<boolean> {
  const result = await client.accountContactChangeChallenge.updateMany({
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

export async function findAccountContactChangeChallengeForSmsVerify(
  id: string,
  client: AuthAccountProfileRepositoryClient = prisma,
): Promise<{
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
} | null> {
  return client.accountContactChangeChallenge.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      type: true,
      nextEmail: true,
      nextPhone: true,
      smsCodeHash: true,
      smsCodeExpiresAt: true,
      smsCodeAttempts: true,
      smsCodeVerifiedAt: true,
      emailCodeVerifiedAt: true,
    },
  });
}

export async function incrementAccountContactChangeSmsAttempts(
  id: string,
  maxAttempts: number,
  client: AuthAccountProfileRepositoryClient = prisma,
): Promise<number> {
  const result = await client.accountContactChangeChallenge.updateMany({
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

export async function markAccountContactChangeSmsVerifiedAndStoreChangeToken(
  input: {
    id: string;
    expectedSmsCodeHash: string;
    changeTokenHash: string;
    changeTokenExpiresAt: Date;
    now: Date;
    maxAttempts: number;
  },
  client: AuthAccountProfileRepositoryClient = prisma,
): Promise<boolean> {
  const result = await client.accountContactChangeChallenge.updateMany({
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
      changeTokenHash: input.changeTokenHash,
      changeTokenExpiresAt: input.changeTokenExpiresAt,
      changeTokenUsedAt: null,
    },
  });

  return result.count === 1;
}

export async function findAccountContactChangeChallengeForComplete(
  id: string,
  client: AuthAccountProfileRepositoryClient = prisma,
): Promise<{
  id: string;
  userId: string;
  type: AccountContactChangeType;
  nextEmail: string | null;
  nextPhone: string | null;
  smsCodeVerifiedAt: Date | null;
  changeTokenHash: string | null;
  changeTokenExpiresAt: Date | null;
  changeTokenUsedAt: Date | null;
} | null> {
  return client.accountContactChangeChallenge.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      type: true,
      nextEmail: true,
      nextPhone: true,
      smsCodeVerifiedAt: true,
      changeTokenHash: true,
      changeTokenExpiresAt: true,
      changeTokenUsedAt: true,
    },
  });
}

export async function completeAccountContactChange(
  input: {
    challengeId: string;
    userId: string;
    expectedChangeTokenHash: string;
    nextEmail?: string;
    nextPhone?: string;
    now: Date;
  },
  client: typeof prisma = prisma,
): Promise<"SUCCESS" | "TARGET_TAKEN" | "INVALID_CHALLENGE"> {
  try {
    return await client.$transaction(async (tx) => {
      const consumed = await tx.accountContactChangeChallenge.updateMany({
        where: {
          id: input.challengeId,
          userId: input.userId,
          changeTokenHash: input.expectedChangeTokenHash,
          changeTokenExpiresAt: {
            gt: input.now,
          },
          changeTokenUsedAt: null,
          smsCodeVerifiedAt: {
            not: null,
          },
        },
        data: {
          changeTokenUsedAt: input.now,
        },
      });

      if (consumed.count !== 1) {
        return "INVALID_CHALLENGE";
      }

      if (input.nextEmail) {
        await tx.user.update({
          where: { id: input.userId },
          data: {
            email: input.nextEmail,
            emailVerified: input.now,
          },
        });
      } else if (input.nextPhone) {
        await tx.user.update({
          where: { id: input.userId },
          data: {
            phone: input.nextPhone,
            phoneVerifiedAt: input.now,
          },
        });
      } else {
        return "INVALID_CHALLENGE";
      }

      await tx.loginChallenge.deleteMany({
        where: { userId: input.userId },
      });
      await tx.passwordResetChallenge.deleteMany({
        where: { userId: input.userId },
      });
      await tx.accountDeleteChallenge.deleteMany({
        where: { userId: input.userId },
      });
      await tx.accountContactChangeChallenge.deleteMany({
        where: { userId: input.userId },
      });

      return "SUCCESS";
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return "TARGET_TAKEN";
    }

    throw error;
  }
}

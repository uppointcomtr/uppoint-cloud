import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/db/client";
import { provisionDefaultTenantForUser } from "@/db/repositories/tenant-repository";

type AuthRegisterRepositoryClient = Prisma.TransactionClient | typeof prisma;

export async function findActiveUserIdByEmail(
  email: string,
  client: AuthRegisterRepositoryClient = prisma,
): Promise<{ id: string } | null> {
  return client.user.findFirst({
    where: {
      email,
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });
}

export async function findActiveUserIdByPhone(
  phone: string,
  client: AuthRegisterRepositoryClient = prisma,
): Promise<{ id: string } | null> {
  return client.user.findFirst({
    where: {
      phone,
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });
}

export async function deleteRegistrationChallengesByEmail(
  email: string,
  client: AuthRegisterRepositoryClient = prisma,
): Promise<void> {
  await client.registrationVerificationChallenge.deleteMany({
    where: {
      email,
    },
  });
}

export async function createRegistrationChallenge(
  input: {
    email: string;
    name: string;
    phone: string;
    passwordHash: string;
    emailCodeHash: string;
    emailCodeExpiresAt: Date;
  },
  client: AuthRegisterRepositoryClient = prisma,
): Promise<{ id: string }> {
  return client.registrationVerificationChallenge.create({
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
}

export async function replaceRegistrationChallengeByEmail(
  input: {
    email: string;
    name: string;
    phone: string;
    passwordHash: string;
    emailCodeHash: string;
    emailCodeExpiresAt: Date;
  },
  client: typeof prisma = prisma,
): Promise<{ id: string }> {
  return client.$transaction(async (tx) => {
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
  });
}

export async function findPendingRegistrationChallengeById(
  challengeId: string,
  client: AuthRegisterRepositoryClient = prisma,
): Promise<{
  email: string;
  name: string;
  phone: string;
  passwordHash: string;
} | null> {
  return client.registrationVerificationChallenge.findUnique({
    where: {
      id: challengeId,
    },
    select: {
      email: true,
      name: true,
      phone: true,
      passwordHash: true,
    },
  });
}

export async function findRegistrationChallengeForEmailVerify(
  id: string,
  client: AuthRegisterRepositoryClient = prisma,
): Promise<{
  id: string;
  phone: string;
  emailCodeHash: string;
  emailCodeExpiresAt: Date;
  emailCodeAttempts: number;
  emailCodeVerifiedAt: Date | null;
} | null> {
  return client.registrationVerificationChallenge.findUnique({
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
  });
}

export async function incrementRegistrationEmailAttempts(
  id: string,
  maxAttempts: number,
  client: AuthRegisterRepositoryClient = prisma,
): Promise<number> {
  const result = await client.registrationVerificationChallenge.updateMany({
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

export async function markRegistrationEmailVerifiedAndStoreSmsCode(
  input: {
    id: string;
    expectedEmailCodeHash: string;
    now: Date;
    smsCodeHash: string;
    smsCodeExpiresAt: Date;
    maxAttempts: number;
  },
  client: AuthRegisterRepositoryClient = prisma,
): Promise<boolean> {
  const result = await client.registrationVerificationChallenge.updateMany({
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

export async function findRegistrationChallengeForSmsVerify(
  id: string,
  client: AuthRegisterRepositoryClient = prisma,
): Promise<{
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
} | null> {
  return client.registrationVerificationChallenge.findUnique({
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
  });
}

export async function incrementRegistrationSmsAttempts(
  id: string,
  maxAttempts: number,
  client: AuthRegisterRepositoryClient = prisma,
): Promise<number> {
  const result = await client.registrationVerificationChallenge.updateMany({
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

export async function completeRegistrationVerification(
  input: {
    challengeId: string;
    email: string;
    name: string;
    phone: string;
    passwordHash: string;
    expectedSmsCodeHash: string;
    now: Date;
    maxAttempts: number;
  },
  client: typeof prisma = prisma,
): Promise<string | null> {
  return client.$transaction(async (tx) => {
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
          lt: input.maxAttempts,
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

    // Security-sensitive: every verified account is provisioned into an isolated tenant boundary by default.
    await provisionDefaultTenantForUser({
      userId: user.id,
      slug: `usr-${user.id}`,
      name: `Workspace ${user.id.slice(-6)}`,
    }, tx);

    await tx.registrationVerificationChallenge.deleteMany({
      where: {
        email: input.email,
      },
    });

    return user.id;
  });
}

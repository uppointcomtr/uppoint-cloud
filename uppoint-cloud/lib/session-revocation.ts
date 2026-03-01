import "server-only";

import { randomUUID } from "crypto";

import { prisma } from "@/db/client";

interface RevokedSessionRecord {
  id: string;
  jti: string;
  expiresAt: Date;
}

interface SessionRevocationDependencies {
  now: () => Date;
  upsertRevokedToken: (input: { jti: string; expiresAt: Date }) => Promise<void>;
  findRevokedTokenByJti: (jti: string) => Promise<RevokedSessionRecord | null>;
  deleteRevokedTokenById: (id: string) => Promise<void>;
}

const defaultDependencies: SessionRevocationDependencies = {
  now: () => new Date(),
  upsertRevokedToken: async ({ jti, expiresAt }) => {
    await prisma.revokedSessionToken.upsert({
      where: { jti },
      update: { expiresAt },
      create: { jti, expiresAt },
    });
  },
  findRevokedTokenByJti: async (jti) =>
    prisma.revokedSessionToken.findUnique({
      where: { jti },
      select: {
        id: true,
        jti: true,
        expiresAt: true,
      },
    }),
  deleteRevokedTokenById: async (id) => {
    await prisma.revokedSessionToken.delete({ where: { id } });
  },
};

function isValidJti(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 16;
}

export function generateSessionJti(): string {
  return randomUUID();
}

export async function revokeSessionJti(
  input: { jti: string; expiresAt: Date },
  dependencies: SessionRevocationDependencies = defaultDependencies,
): Promise<void> {
  if (!isValidJti(input.jti)) {
    return;
  }

  const now = dependencies.now();

  // Expired tokens do not need blacklist persistence.
  if (input.expiresAt <= now) {
    return;
  }

  await dependencies.upsertRevokedToken({
    jti: input.jti.trim(),
    expiresAt: input.expiresAt,
  });
}

export async function isSessionJtiRevoked(
  jti: string | undefined,
  dependencies: SessionRevocationDependencies = defaultDependencies,
): Promise<boolean> {
  if (!isValidJti(jti)) {
    return false;
  }

  const record = await dependencies.findRevokedTokenByJti(jti.trim());

  if (!record) {
    return false;
  }

  if (record.expiresAt <= dependencies.now()) {
    await dependencies.deleteRevokedTokenById(record.id).catch(() => {
      // best-effort cleanup: stale blacklist rows should not fail auth requests
    });
    return false;
  }

  return true;
}

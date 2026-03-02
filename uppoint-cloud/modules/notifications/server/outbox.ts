import "server-only";

import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/db/client";
import { env } from "@/lib/env";
import { sendAuthEmail } from "@/modules/auth/server/email-service";
import { sendAuthSms } from "@/modules/auth/server/sms-service";

type NotificationChannel = "EMAIL" | "SMS";
type NotificationOutboxStatus = "PENDING" | "SENT" | "FAILED";

const DEFAULT_DISPATCH_BATCH_SIZE = 20;
const MAX_ALLOWED_BATCH_SIZE = 200;
const LOCK_STALE_SECONDS = 120;
const MAX_BACKOFF_SECONDS = 15 * 60;

interface NotificationOutboxRecord {
  id: string;
  channel: NotificationChannel;
  recipient: string;
  subject: string | null;
  body: string;
  attemptCount: number;
  maxAttempts: number;
}

interface OutboxDependencies {
  now: () => Date;
  createOutboxRecord: (input: {
    channel: NotificationChannel;
    recipient: string;
    subject?: string;
    body: string;
    metadata?: Prisma.InputJsonValue;
  }) => Promise<void>;
  findDueRecords: (input: {
    now: Date;
    take: number;
  }) => Promise<NotificationOutboxRecord[]>;
  acquireLock: (input: { id: string; now: Date; lockOwner: string; staleBefore: Date }) => Promise<boolean>;
  markSent: (input: { id: string; now: Date; lockOwner: string }) => Promise<void>;
  markFailedAttempt: (input: {
    id: string;
    lockOwner: string;
    nextStatus: NotificationOutboxStatus;
    nextAttemptAt: Date;
    nextAttemptCount: number;
    errorMessage: string;
  }) => Promise<void>;
  sendEmail: (input: { to: string; subject: string; text: string }) => Promise<void>;
  sendSms: (input: { to: string; message: string }) => Promise<void>;
}

const defaultOutboxDependencies: OutboxDependencies = {
  now: () => new Date(),
  createOutboxRecord: async (input) => {
    const metadata = input.metadata ? JSON.stringify(input.metadata) : null;
    await prisma.$executeRaw`
      INSERT INTO "NotificationOutbox" (
        "id", "channel", "recipient", "subject", "body", "metadata", "status", "nextAttemptAt", "updatedAt"
      )
      VALUES (
        ${randomUUID()},
        ${input.channel}::"NotificationChannel",
        ${input.recipient},
        ${input.subject ?? null},
        ${input.body},
        ${metadata ? metadata : null}::jsonb,
        'PENDING'::"NotificationOutboxStatus",
        NOW(),
        NOW()
      )
    `;
  },
  findDueRecords: async ({ now, take }) =>
    prisma.$queryRaw<NotificationOutboxRecord[]>`
      SELECT
        "id",
        "channel",
        "recipient",
        "subject",
        "body",
        "attemptCount",
        "maxAttempts"
      FROM "NotificationOutbox"
      WHERE "status" = 'PENDING'::"NotificationOutboxStatus"
        AND "nextAttemptAt" <= ${now}
      ORDER BY "createdAt" ASC
      LIMIT ${take}
    `,
  acquireLock: async ({ id, now, lockOwner, staleBefore }) => {
    const updated = await prisma.$executeRaw`
      UPDATE "NotificationOutbox"
      SET "lockedAt" = ${now}, "lockedBy" = ${lockOwner}, "updatedAt" = ${now}
      WHERE "id" = ${id}
        AND "status" = 'PENDING'::"NotificationOutboxStatus"
        AND ("lockedAt" IS NULL OR "lockedAt" < ${staleBefore})
    `;

    return Number(updated) === 1;
  },
  markSent: async ({ id, now, lockOwner }) => {
    await prisma.$executeRaw`
      UPDATE "NotificationOutbox"
      SET
        "status" = 'SENT'::"NotificationOutboxStatus",
        "sentAt" = ${now},
        "attemptCount" = "attemptCount" + 1,
        "lockedAt" = NULL,
        "lockedBy" = NULL,
        "lastError" = NULL,
        "updatedAt" = ${now}
      WHERE "id" = ${id}
        AND "lockedBy" = ${lockOwner}
    `;
  },
  markFailedAttempt: async ({ id, lockOwner, nextStatus, nextAttemptAt, nextAttemptCount, errorMessage }) => {
    await prisma.$executeRaw`
      UPDATE "NotificationOutbox"
      SET
        "status" = ${nextStatus}::"NotificationOutboxStatus",
        "attemptCount" = ${nextAttemptCount},
        "nextAttemptAt" = ${nextAttemptAt},
        "lastError" = ${errorMessage},
        "lockedAt" = NULL,
        "lockedBy" = NULL,
        "updatedAt" = NOW()
      WHERE "id" = ${id}
        AND "lockedBy" = ${lockOwner}
    `;
  },
  sendEmail: async (input) => sendAuthEmail(input),
  sendSms: async (input) => sendAuthSms(input),
};

function trimErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim().slice(0, 500);
  }

  return "NOTIFICATION_DELIVERY_FAILED";
}

function computeRetryDelaySeconds(attemptCount: number): number {
  const exponent = Math.max(0, Math.min(attemptCount, 8));
  return Math.min(MAX_BACKOFF_SECONDS, 2 ** exponent);
}

function clampDispatchBatchSize(batchSize?: number): number {
  if (!batchSize || Number.isNaN(batchSize)) {
    return DEFAULT_DISPATCH_BATCH_SIZE;
  }

  return Math.max(1, Math.min(MAX_ALLOWED_BATCH_SIZE, Math.floor(batchSize)));
}

export async function enqueueEmailNotification(
  input: {
    to: string;
    subject: string;
    text: string;
    metadata?: Prisma.InputJsonValue;
  },
  dependencies: Pick<OutboxDependencies, "createOutboxRecord"> = defaultOutboxDependencies,
): Promise<void> {
  if (env.UPPOINT_EMAIL_BACKEND === "disabled") {
    return;
  }

  await dependencies.createOutboxRecord({
    channel: "EMAIL",
    recipient: input.to,
    subject: input.subject,
    body: input.text,
    metadata: input.metadata,
  });
}

export async function enqueueSmsNotification(
  input: {
    to: string;
    message: string;
    metadata?: Prisma.InputJsonValue;
  },
  dependencies: Pick<OutboxDependencies, "createOutboxRecord"> = defaultOutboxDependencies,
): Promise<void> {
  if (!env.UPPOINT_SMS_ENABLED) {
    return;
  }

  await dependencies.createOutboxRecord({
    channel: "SMS",
    recipient: input.to,
    body: input.message,
    metadata: input.metadata,
  });
}

export interface DispatchOutboxResult {
  inspected: number;
  sent: number;
  failed: number;
}

export async function dispatchNotificationOutboxBatch(
  input?: { batchSize?: number; lockOwner?: string },
  dependencies: OutboxDependencies = defaultOutboxDependencies,
): Promise<DispatchOutboxResult> {
  const now = dependencies.now();
  const batchSize = clampDispatchBatchSize(input?.batchSize);
  const lockOwner = input?.lockOwner?.trim() || `worker-${randomUUID()}`;
  const staleBefore = new Date(now.getTime() - LOCK_STALE_SECONDS * 1000);

  const records = await dependencies.findDueRecords({ now, take: batchSize });
  let sent = 0;
  let failed = 0;

  for (const record of records) {
    const lockAcquired = await dependencies.acquireLock({
      id: record.id,
      now,
      lockOwner,
      staleBefore,
    });

    if (!lockAcquired) {
      continue;
    }

    try {
      if (record.channel === "EMAIL") {
        await dependencies.sendEmail({
          to: record.recipient,
          subject: record.subject ?? "",
          text: record.body,
        });
      } else {
        await dependencies.sendSms({
          to: record.recipient,
          message: record.body,
        });
      }

      await dependencies.markSent({ id: record.id, now, lockOwner });
      sent += 1;
    } catch (error) {
      const nextAttemptCount = record.attemptCount + 1;
      const reachedMaxAttempts = nextAttemptCount >= record.maxAttempts;
      const retryDelaySeconds = computeRetryDelaySeconds(nextAttemptCount);
      const nextAttemptAt = reachedMaxAttempts
        ? now
        : new Date(now.getTime() + retryDelaySeconds * 1000);

      await dependencies.markFailedAttempt({
        id: record.id,
        lockOwner,
        nextStatus: reachedMaxAttempts ? "FAILED" : "PENDING",
        nextAttemptAt,
        nextAttemptCount,
        errorMessage: trimErrorMessage(error),
      });
      failed += 1;
    }
  }

  return {
    inspected: records.length,
    sent,
    failed,
  };
}

import "server-only";

import type { PlatformRole, Prisma } from "@prisma/client";
import { InstanceProvisioningStatus } from "@prisma/client";

import { prisma } from "@/db/client";

type PlatformOperationsClient = Prisma.TransactionClient | typeof prisma;

export interface PlatformUserAccessSnapshot {
  id: string;
  email: string;
  platformRole: PlatformRole | null;
}

export interface PlatformProvisioningJobView {
  id: string;
  status: InstanceProvisioningStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  providerRef: string | null;
  providerMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  resourceGroup: {
    id: string;
    name: string;
    regionCode: string;
  };
  instance: {
    id: string;
    name: string;
    providerInstanceRef: string | null;
    lifecycleStatus: InstanceProvisioningStatus;
    powerState: string;
  } | null;
  recentEvents: Array<{
    id: string;
    eventType: string;
    createdAt: Date;
  }>;
}

export interface PlatformOperationsSummary {
  generatedAt: Date;
  jobCounts: Record<InstanceProvisioningStatus, number>;
  stuckLocks: number;
  retryableFailures: number;
  failedAuditEvents24h: number;
  recentJobs: PlatformProvisioningJobView[];
}

export async function findPlatformUserAccessSnapshot(
  input: { userId: string },
  client: PlatformOperationsClient = prisma,
): Promise<PlatformUserAccessSnapshot | null> {
  return client.user.findFirst({
    where: {
      id: input.userId,
      deletedAt: null,
    },
    select: {
      id: true,
      email: true,
      platformRole: true,
    },
  });
}

function createEmptyJobCounts(): Record<InstanceProvisioningStatus, number> {
  return {
    [InstanceProvisioningStatus.PENDING]: 0,
    [InstanceProvisioningStatus.RUNNING]: 0,
    [InstanceProvisioningStatus.FAILED]: 0,
    [InstanceProvisioningStatus.COMPLETED]: 0,
    [InstanceProvisioningStatus.CANCELLED]: 0,
  };
}

export async function getPlatformOperationsSummary(
  input: { now?: Date; take?: number },
  client: PlatformOperationsClient = prisma,
): Promise<PlatformOperationsSummary> {
  const now = input.now ?? new Date();
  const take = Math.max(1, Math.min(input.take ?? 20, 100));
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const staleLockBefore = new Date(now.getTime() - 15 * 60 * 1000);

  const [
    groupedJobs,
    stuckLocks,
    retryableFailures,
    failedAuditEvents24h,
    recentJobs,
  ] = await Promise.all([
    client.instanceProvisioningJob.groupBy({
      by: ["status"],
      _count: {
        _all: true,
      },
    }),
    client.instanceProvisioningJob.count({
      where: {
        status: InstanceProvisioningStatus.RUNNING,
        lockedAt: {
          lt: staleLockBefore,
        },
      },
    }),
    client.instanceProvisioningJob.count({
      where: {
        status: InstanceProvisioningStatus.PENDING,
        attemptCount: {
          gt: 0,
        },
      },
    }),
    client.auditLog.count({
      where: {
        result: "FAILURE",
        createdAt: {
          gte: since24h,
        },
      },
    }),
    client.instanceProvisioningJob.findMany({
      orderBy: [
        { updatedAt: "desc" },
        { createdAt: "desc" },
      ],
      take,
      select: {
        id: true,
        status: true,
        attemptCount: true,
        maxAttempts: true,
        nextAttemptAt: true,
        lockedAt: true,
        lockedBy: true,
        lastErrorCode: true,
        lastErrorMessage: true,
        providerRef: true,
        providerMessage: true,
        createdAt: true,
        updatedAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        resourceGroup: {
          select: {
            id: true,
            name: true,
            regionCode: true,
          },
        },
        instance: {
          select: {
            id: true,
            name: true,
            providerInstanceRef: true,
            lifecycleStatus: true,
            powerState: true,
          },
        },
        events: {
          orderBy: {
            createdAt: "desc",
          },
          take: 6,
          select: {
            id: true,
            eventType: true,
            createdAt: true,
          },
        },
      },
    }),
  ]);

  const jobCounts = createEmptyJobCounts();
  for (const group of groupedJobs) {
    jobCounts[group.status] = group._count._all;
  }

  return {
    generatedAt: now,
    jobCounts,
    stuckLocks,
    retryableFailures,
    failedAuditEvents24h,
    recentJobs: recentJobs.map((job) => ({
      id: job.id,
      status: job.status,
      attemptCount: job.attemptCount,
      maxAttempts: job.maxAttempts,
      nextAttemptAt: job.nextAttemptAt,
      lockedAt: job.lockedAt,
      lockedBy: job.lockedBy,
      lastErrorCode: job.lastErrorCode,
      lastErrorMessage: job.lastErrorMessage,
      providerRef: job.providerRef,
      providerMessage: job.providerMessage,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      tenant: job.tenant,
      resourceGroup: job.resourceGroup,
      instance: job.instance
        ? {
            ...job.instance,
            powerState: job.instance.powerState,
          }
        : null,
      recentEvents: job.events,
    })),
  };
}

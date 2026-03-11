import "server-only";

import { NotificationOutboxStatus, TenantRole } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/db/client";

type DashboardRepositoryClient = Prisma.TransactionClient | typeof prisma;

export interface DashboardUserSnapshot {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  emailVerified: Date | null;
  phoneVerifiedAt: Date | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
}

export interface DashboardAuditEvent {
  action: string;
  result: string | null;
  reason: string | null;
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface DashboardTenantMembershipOption {
  tenantId: string;
  tenantName: string;
  role: TenantRole;
}

export async function findActiveUserDashboardSnapshot(
  input: { userId: string },
  client: DashboardRepositoryClient = prisma,
): Promise<DashboardUserSnapshot | null> {
  return client.user.findFirst({
    where: {
      id: input.userId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      emailVerified: true,
      phoneVerifiedAt: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      lastLoginAt: true,
    },
  });
}

export async function countUserActiveSessions(
  input: { userId: string; now: Date },
  client: DashboardRepositoryClient = prisma,
): Promise<number> {
  return client.session.count({
    where: {
      userId: input.userId,
      expires: {
        gt: input.now,
      },
    },
  });
}

export async function countUserNotificationByStatus(
  input: { userId: string; status: NotificationOutboxStatus; since?: Date; tenantId?: string },
  client: DashboardRepositoryClient = prisma,
): Promise<number> {
  return client.notificationOutbox.count({
    where: {
      userId: input.userId,
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      status: input.status,
      ...(input.since
        ? {
            updatedAt: {
              gte: input.since,
            },
          }
        : {}),
    },
  });
}

export async function countUserAuditFailuresSince(
  input: { userId: string; since: Date; tenantId?: string },
  client: DashboardRepositoryClient = prisma,
): Promise<number> {
  const tenantScopeFilter = input.tenantId
    ? {
        OR: [
          { tenantId: input.tenantId },
          { tenantId: null },
        ],
      }
    : {};

  return client.auditLog.count({
    where: {
      userId: input.userId,
      ...tenantScopeFilter,
      result: "FAILURE",
      createdAt: {
        gte: input.since,
      },
    },
  });
}

export async function listRecentUserAuditEvents(
  input: { userId: string; take?: number; tenantId?: string },
  client: DashboardRepositoryClient = prisma,
): Promise<DashboardAuditEvent[]> {
  const tenantScopeFilter = input.tenantId
    ? {
        OR: [
          { tenantId: input.tenantId },
          { tenantId: null },
        ],
      }
    : {};

  return client.auditLog.findMany({
    where: {
      userId: input.userId,
      ...tenantScopeFilter,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: input.take ?? 6,
    select: {
      action: true,
      result: true,
      reason: true,
      requestId: true,
      ip: true,
      userAgent: true,
      createdAt: true,
    },
  });
}

export async function listActiveUserTenantMembershipOptions(
  input: { userId: string; take?: number },
  client: DashboardRepositoryClient = prisma,
): Promise<DashboardTenantMembershipOption[]> {
  const memberships = await client.tenantMembership.findMany({
    where: {
      userId: input.userId,
      tenant: {
        deletedAt: null,
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    take: input.take ?? 20,
    select: {
      tenantId: true,
      role: true,
      tenant: {
        select: {
          name: true,
        },
      },
    },
  });

  return memberships.map((membership) => ({
    tenantId: membership.tenantId,
    tenantName: membership.tenant.name,
    role: membership.role,
  }));
}

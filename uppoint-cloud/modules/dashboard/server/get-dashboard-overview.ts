import "server-only";

import { NotificationOutboxStatus, TenantRole } from "@prisma/client";

import {
  countUserActiveSessions,
  countUserAuditFailuresSince,
  countUserNotificationByStatus,
  findActiveUserDashboardSnapshot,
  listActiveUserTenantMembershipOptions,
  listRecentUserAuditEvents,
  type DashboardAuditEvent,
  type DashboardTenantMembershipOption,
  type DashboardUserSnapshot,
} from "@/db/repositories/dashboard-repository";
import { logAudit } from "@/lib/audit-log";
import { env } from "@/lib/env";
import { resolveUserTenantContext, UserTenantContextError } from "@/modules/tenant/server/user-tenant";

interface DashboardTenantContext {
  tenantId: string;
  role: TenantRole;
}

interface DashboardNotificationsSummary {
  pending: number;
  sent24h: number;
  failed24h: number;
}

interface DashboardRuntimeSummary {
  appUrl: string;
  internalTransportMode: "loopback-hmac-v1" | "mtls-hmac-v1";
  rateLimitBackend: "redis-local" | "redis-upstash" | "prisma-fallback";
}

const SECURITY_EVENTS_TAKE = 60;

export interface DashboardTenantSelectionOption extends DashboardTenantMembershipOption {
  isSelected: boolean;
}

export interface DashboardOverview {
  generatedAt: Date;
  user: DashboardUserSnapshot;
  tenant: DashboardTenantContext | null;
  tenantOptions: DashboardTenantSelectionOption[];
  tenantErrorCode: UserTenantContextError["code"] | null;
  notifications: DashboardNotificationsSummary;
  auditFailures24h: number;
  recentAuditEvents: DashboardAuditEvent[];
  activeSessions: number;
  sessionExpiresAt: Date;
  runtime: DashboardRuntimeSummary;
}

export interface DashboardOverviewDependencies {
  resolveTenantContext: (input: {
    userId: string;
    tenantId?: string;
    minimumRole?: TenantRole;
  }) => Promise<DashboardTenantContext>;
  findUserSnapshot: (input: { userId: string }) => Promise<DashboardUserSnapshot | null>;
  countUserNotificationByStatus: (input: {
    userId: string;
    status: NotificationOutboxStatus;
    since?: Date;
    tenantId?: string;
  }) => Promise<number>;
  countUserAuditFailuresSince: (input: { userId: string; since: Date; tenantId?: string }) => Promise<number>;
  listRecentUserAuditEvents: (input: { userId: string; take?: number; tenantId?: string }) => Promise<DashboardAuditEvent[]>;
  listUserTenantOptions: (input: { userId: string; take?: number }) => Promise<DashboardTenantMembershipOption[]>;
  countUserActiveSessions: (input: { userId: string; now: Date }) => Promise<number>;
  logAudit: typeof logAudit;
  now: () => Date;
}

const defaultDependencies: DashboardOverviewDependencies = {
  resolveTenantContext: async ({ userId, tenantId, minimumRole }) => resolveUserTenantContext({ userId, tenantId, minimumRole }),
  findUserSnapshot: async ({ userId }) => findActiveUserDashboardSnapshot({ userId }),
  countUserNotificationByStatus: async ({ userId, status, since }) =>
    countUserNotificationByStatus({ userId, status, since }),
  countUserAuditFailuresSince: async ({ userId, since }) => countUserAuditFailuresSince({ userId, since }),
  listRecentUserAuditEvents: async ({ userId, take }) => listRecentUserAuditEvents({ userId, take }),
  listUserTenantOptions: async ({ userId, take }) => listActiveUserTenantMembershipOptions({ userId, take }),
  countUserActiveSessions: async ({ userId, now }) => countUserActiveSessions({ userId, now }),
  logAudit,
  now: () => new Date(),
};

function resolveRateLimitBackend(): DashboardRuntimeSummary["rateLimitBackend"] {
  if (env.RATE_LIMIT_REDIS_URL) {
    return "redis-local";
  }

  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return "redis-upstash";
  }

  return "prisma-fallback";
}

export async function getDashboardOverview(
  input: { userId: string; sessionExpiresAt: string; tenantId?: string },
  dependencies: DashboardOverviewDependencies = defaultDependencies,
): Promise<DashboardOverview> {
  const now = dependencies.now();
  const since24h = new Date(now.getTime() - (24 * 60 * 60 * 1000));
  let tenantContext: DashboardTenantContext | null = null;
  let tenantErrorCode: UserTenantContextError["code"] | null = null;

  try {
    tenantContext = await dependencies.resolveTenantContext({
      userId: input.userId,
      tenantId: input.tenantId,
      minimumRole: TenantRole.MEMBER,
    });
  } catch (error) {
    if (error instanceof UserTenantContextError) {
      tenantErrorCode = error.code;
      await dependencies.logAudit(
        error.code === "TENANT_NOT_FOUND" ? "tenant_context_missing" : "tenant_access_denied",
        "unknown",
        input.userId,
        {
          reason: error.code,
          tenantId: input.tenantId ?? null,
          result: "FAILURE",
        },
      );
    } else {
      throw error;
    }
  }

  const user = await dependencies.findUserSnapshot({ userId: input.userId });
  if (!user) {
    throw new Error("DASHBOARD_USER_NOT_FOUND");
  }

  const selectedTenantId = tenantContext?.tenantId;
  const [pendingCount, sent24hCount, failed24hCount, auditFailures24h, recentAuditEvents, activeSessions] = await Promise.all([
    selectedTenantId
      ? dependencies.countUserNotificationByStatus({
          userId: input.userId,
          tenantId: selectedTenantId,
          status: NotificationOutboxStatus.PENDING,
        })
      : Promise.resolve(0),
    selectedTenantId
      ? dependencies.countUserNotificationByStatus({
          userId: input.userId,
          tenantId: selectedTenantId,
          status: NotificationOutboxStatus.SENT,
          since: since24h,
        })
      : Promise.resolve(0),
    selectedTenantId
      ? dependencies.countUserNotificationByStatus({
          userId: input.userId,
          tenantId: selectedTenantId,
          status: NotificationOutboxStatus.FAILED,
          since: since24h,
        })
      : Promise.resolve(0),
    selectedTenantId
      ? dependencies.countUserAuditFailuresSince({
          userId: input.userId,
          tenantId: selectedTenantId,
          since: since24h,
        })
      : Promise.resolve(0),
    selectedTenantId
      ? dependencies.listRecentUserAuditEvents({
          userId: input.userId,
          tenantId: selectedTenantId,
          take: SECURITY_EVENTS_TAKE,
        })
      : Promise.resolve([]),
    dependencies.countUserActiveSessions({
      userId: input.userId,
      now,
    }),
  ]);

  const tenantOptions = (await dependencies.listUserTenantOptions({ userId: input.userId, take: 20 })).map((option) => ({
    ...option,
    isSelected: tenantContext?.tenantId === option.tenantId,
  }));

  // JWT strategy may not persist rows in Session table for every active browser tab/device.
  // Since this function runs only for an authenticated user context, active session count must be at least 1.
  const normalizedActiveSessions = Math.max(activeSessions, 1);

  return {
    generatedAt: now,
    user,
    tenant: tenantContext,
    tenantOptions,
    tenantErrorCode,
    notifications: {
      pending: pendingCount,
      sent24h: sent24hCount,
      failed24h: failed24hCount,
    },
    auditFailures24h,
    recentAuditEvents,
    activeSessions: normalizedActiveSessions,
    sessionExpiresAt: new Date(input.sessionExpiresAt),
    runtime: {
      appUrl: env.NEXT_PUBLIC_APP_URL,
      internalTransportMode: env.INTERNAL_AUTH_TRANSPORT_MODE,
      rateLimitBackend: resolveRateLimitBackend(),
    },
  };
}

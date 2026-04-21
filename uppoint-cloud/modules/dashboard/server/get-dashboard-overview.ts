import "server-only";

import { NotificationOutboxStatus, TenantRole } from "@prisma/client";
import type { InstanceRuntimeView, ResourceGroupView } from "@/modules/instances/domain/contracts";

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
import {
  listActiveInstancesForTenant,
  listActiveResourceGroupsForTenant,
} from "@/db/repositories/instance-control-plane-repository";
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

interface DashboardCurrentSessionContext {
  ip: string | null;
  userAgent: string | null;
  observedAt: Date;
  loginAt: Date | null;
}

const SECURITY_EVENTS_TAKE = 60;
const DASHBOARD_RESOURCE_GROUPS_TAKE = 12;
const DASHBOARD_INSTANCES_TAKE = 20;
const DASHBOARD_NON_SECURITY_AUDIT_ACTIONS = ["tenant_selection_required"] as const;

interface DashboardResourceGroupSummary {
  totalActive: number;
  recent: Array<{
    id: string;
    name: string;
    regionCode: string;
    createdAt: Date;
  }>;
}

interface DashboardInstanceSummary {
  totalActive: number;
  recent: Array<{
    instanceId: string;
    name: string;
    resourceGroupId: string;
    lifecycleState: InstanceRuntimeView["lifecycleState"];
    powerState: InstanceRuntimeView["powerState"];
    createdAt: Date;
  }>;
}

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
  currentSession: DashboardCurrentSessionContext;
  sessionExpiresAt: Date;
  runtime: DashboardRuntimeSummary;
  resourceGroups: DashboardResourceGroupSummary;
  instances: DashboardInstanceSummary;
}

interface DashboardAuditContext {
  ip: string | null;
  requestId: string | null;
  userAgent: string | null;
  forwardedFor: string | null;
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
  countUserAuditFailuresSince: (input: {
    userId: string;
    since: Date;
    tenantId?: string;
    excludeActions?: string[];
  }) => Promise<number>;
  listRecentUserAuditEvents: (input: {
    userId: string;
    take?: number;
    tenantId?: string;
    excludeActions?: string[];
  }) => Promise<DashboardAuditEvent[]>;
  listUserTenantOptions: (input: { userId: string; take?: number }) => Promise<DashboardTenantMembershipOption[]>;
  countUserActiveSessions: (input: { userId: string; now: Date }) => Promise<number>;
  listActiveResourceGroups: (input: { tenantId: string; take?: number }) => Promise<ResourceGroupView[]>;
  listActiveInstances: (input: { tenantId: string; take?: number }) => Promise<InstanceRuntimeView[]>;
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
  listActiveResourceGroups: async ({ tenantId, take }) => listActiveResourceGroupsForTenant({ tenantId, take }),
  listActiveInstances: async ({ tenantId, take }) => listActiveInstancesForTenant({ tenantId, take }),
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

function resolveTenantContextAuditAction(
  code: UserTenantContextError["code"],
): "tenant_context_missing" | "tenant_access_denied" | "tenant_selection_required" {
  switch (code) {
    case "TENANT_NOT_FOUND":
      return "tenant_context_missing";
    case "TENANT_SELECTION_REQUIRED":
      return "tenant_selection_required";
    case "TENANT_ACCESS_DENIED":
    default:
      return "tenant_access_denied";
  }
}

export async function getDashboardOverview(
  input: {
    userId: string;
    sessionExpiresAt: string;
    tenantId?: string;
    currentRequestIp?: string | null;
    currentRequestUserAgent?: string | null;
    currentRequestId?: string | null;
    currentForwardedFor?: string | null;
  },
  dependencies: DashboardOverviewDependencies = defaultDependencies,
): Promise<DashboardOverview> {
  const now = dependencies.now();
  const since24h = new Date(now.getTime() - (24 * 60 * 60 * 1000));
  let tenantContext: DashboardTenantContext | null = null;
  let tenantErrorCode: UserTenantContextError["code"] | null = null;
  const auditContext: DashboardAuditContext = {
    ip: input.currentRequestIp?.trim() || null,
    requestId: input.currentRequestId?.trim() || null,
    userAgent: input.currentRequestUserAgent?.trim() || null,
    forwardedFor: input.currentForwardedFor?.trim() || null,
  };

  try {
    tenantContext = await dependencies.resolveTenantContext({
      userId: input.userId,
      tenantId: input.tenantId,
      minimumRole: TenantRole.MEMBER,
    });
  } catch (error) {
    if (error instanceof UserTenantContextError) {
      tenantErrorCode = error.code;
      if (error.code !== "TENANT_SELECTION_REQUIRED") {
        await dependencies.logAudit(
          resolveTenantContextAuditAction(error.code),
          auditContext.ip ?? "unknown",
          input.userId,
          {
            reason: error.code,
            tenantId: input.tenantId ?? null,
            result: "FAILURE",
            requestId: auditContext.requestId,
            userAgent: auditContext.userAgent,
            forwardedFor: auditContext.forwardedFor,
          },
        );
      }
    } else {
      throw error;
    }
  }

  const user = await dependencies.findUserSnapshot({ userId: input.userId });
  if (!user) {
    throw new Error("DASHBOARD_USER_NOT_FOUND");
  }

  const selectedTenantId = tenantContext?.tenantId;
  const [
    pendingCount,
    sent24hCount,
    failed24hCount,
    auditFailures24h,
    recentAuditEvents,
    activeSessions,
    activeResourceGroups,
    activeInstances,
  ] = await Promise.all([
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
          excludeActions: [...DASHBOARD_NON_SECURITY_AUDIT_ACTIONS],
        })
      : dependencies.countUserAuditFailuresSince({
          userId: input.userId,
          since: since24h,
          excludeActions: [...DASHBOARD_NON_SECURITY_AUDIT_ACTIONS],
        }),
    selectedTenantId
      ? dependencies.listRecentUserAuditEvents({
          userId: input.userId,
          tenantId: selectedTenantId,
          take: SECURITY_EVENTS_TAKE,
          excludeActions: [...DASHBOARD_NON_SECURITY_AUDIT_ACTIONS],
        })
      : dependencies.listRecentUserAuditEvents({
          userId: input.userId,
          take: SECURITY_EVENTS_TAKE,
          excludeActions: [...DASHBOARD_NON_SECURITY_AUDIT_ACTIONS],
        }),
    dependencies.countUserActiveSessions({
      userId: input.userId,
      now,
    }),
    selectedTenantId
      ? dependencies.listActiveResourceGroups({
          tenantId: selectedTenantId,
          take: DASHBOARD_RESOURCE_GROUPS_TAKE,
        })
      : Promise.resolve([]),
    selectedTenantId
      ? dependencies.listActiveInstances({
          tenantId: selectedTenantId,
          take: DASHBOARD_INSTANCES_TAKE,
        })
      : Promise.resolve([]),
  ]);

  const tenantOptions = (await dependencies.listUserTenantOptions({ userId: input.userId, take: 20 })).map((option) => ({
    ...option,
    isSelected: tenantContext?.tenantId === option.tenantId,
  }));

  // JWT strategy does not persist every browser/device session row.
  // Treat the count as a lower-bound signal and never present "0" for an authenticated request.
  const normalizedActiveSessions = Math.max(activeSessions, 1);
  const recentResourceGroups = activeResourceGroups.slice(-4).reverse();
  const recentInstances = activeInstances.slice(0, 6);

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
    currentSession: {
      ip: input.currentRequestIp?.trim() ? input.currentRequestIp.trim() : null,
      userAgent: input.currentRequestUserAgent?.trim() ? input.currentRequestUserAgent.trim().slice(0, 255) : null,
      observedAt: now,
      loginAt: user.lastLoginAt,
    },
    sessionExpiresAt: new Date(input.sessionExpiresAt),
    runtime: {
      appUrl: env.NEXT_PUBLIC_APP_URL,
      internalTransportMode: env.INTERNAL_AUTH_TRANSPORT_MODE,
      rateLimitBackend: resolveRateLimitBackend(),
    },
    resourceGroups: {
      totalActive: activeResourceGroups.length,
      recent: recentResourceGroups.map((group) => ({
        id: group.id,
        name: group.name,
        regionCode: group.regionCode,
        createdAt: group.createdAt,
      })),
    },
    instances: {
      totalActive: activeInstances.length,
      recent: recentInstances.map((instance) => ({
        instanceId: instance.instanceId,
        name: instance.name,
        resourceGroupId: instance.resourceGroupId,
        lifecycleState: instance.lifecycleState,
        powerState: instance.powerState,
        createdAt: instance.createdAt,
      })),
    },
  };
}

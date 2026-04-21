import { NotificationOutboxStatus, TenantRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  getDashboardOverview,
  type DashboardOverviewDependencies,
} from "@/modules/dashboard/server/get-dashboard-overview";
import type { InstanceRuntimeView } from "@/modules/instances/domain/contracts";
import { UserTenantContextError } from "@/modules/tenant/server/user-tenant";

function createBaseDependencies(overrides?: Partial<DashboardOverviewDependencies>): DashboardOverviewDependencies {
  const now = new Date("2026-03-05T08:30:00.000Z");

  return {
    resolveTenantContext: vi.fn(async () => ({ tenantId: "tenant_1", role: TenantRole.OWNER })),
    findUserSnapshot: vi.fn(async () => ({
      id: "user_1",
      name: "Test User",
      email: "user@example.com",
      phone: "+905551112233",
      createdAt: new Date("2026-02-19T09:00:00.000Z"),
      emailVerified: new Date("2026-03-01T10:00:00.000Z"),
      phoneVerifiedAt: new Date("2026-03-01T10:05:00.000Z"),
      failedLoginAttempts: 1,
      lockedUntil: null,
      lastLoginAt: new Date("2026-03-05T08:00:00.000Z"),
    })),
    countUserNotificationByStatus: vi.fn(async ({ status }) => {
      if (status === NotificationOutboxStatus.PENDING) {
        return 2;
      }
      if (status === NotificationOutboxStatus.SENT) {
        return 9;
      }
      return 1;
    }),
    countUserAuditFailuresSince: vi.fn(async () => 3),
    listRecentUserAuditEvents: vi.fn(async () => ([
      {
        action: "login_success",
        result: "SUCCESS",
        reason: null,
        requestId: "req-1",
        ip: "88.236.40.120",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0",
        createdAt: new Date("2026-03-05T08:10:00.000Z"),
      },
    ])),
    listUserTenantOptions: vi.fn(async () => ([
      {
        tenantId: "tenant_1",
        tenantName: "Tenant Alpha",
        role: TenantRole.OWNER,
      },
      {
        tenantId: "tenant_2",
        tenantName: "Tenant Beta",
        role: TenantRole.ADMIN,
      },
    ])),
    countUserActiveSessions: vi.fn(async () => 2),
    listActiveResourceGroups: vi.fn(async () => ([
      {
        id: "rg_1",
        tenantId: "tenant_1",
        name: "Core RG",
        slug: "core-rg",
        regionCode: "tr-ist-1",
        createdAt: new Date("2026-03-04T09:00:00.000Z"),
        updatedAt: new Date("2026-03-04T09:00:00.000Z"),
      },
      {
        id: "rg_2",
        tenantId: "tenant_1",
        name: "Edge RG",
        slug: "edge-rg",
        regionCode: "tr-ist-1",
        createdAt: new Date("2026-03-05T08:00:00.000Z"),
        updatedAt: new Date("2026-03-05T08:00:00.000Z"),
      },
    ])),
    listActiveInstances: vi.fn(async (): Promise<InstanceRuntimeView[]> => ([
      {
        instanceId: "inst_1",
        tenantId: "tenant_1",
        resourceGroupId: "rg_2",
        name: "web-01",
        powerState: "running",
        lifecycleState: "running",
        providerInstanceRef: "vm-001",
        createdAt: new Date("2026-03-05T08:10:00.000Z"),
        updatedAt: new Date("2026-03-05T08:15:00.000Z"),
      },
    ])),
    logAudit: vi.fn(async () => {}),
    now: () => now,
    ...overrides,
  };
}

describe("getDashboardOverview", () => {
  it("returns aggregated dashboard metrics for authenticated users", async () => {
    const dependencies = createBaseDependencies();
    const result = await getDashboardOverview({
      userId: "user_1",
      tenantId: "tenant_1",
      sessionExpiresAt: "2026-03-05T10:30:00.000Z",
    }, dependencies);

    expect(result.user.email).toBe("user@example.com");
    expect(result.tenant).toEqual({ tenantId: "tenant_1", role: TenantRole.OWNER });
    expect(result.tenantErrorCode).toBeNull();
    expect(result.tenantOptions).toEqual([
      {
        tenantId: "tenant_1",
        tenantName: "Tenant Alpha",
        role: TenantRole.OWNER,
        isSelected: true,
      },
      {
        tenantId: "tenant_2",
        tenantName: "Tenant Beta",
        role: TenantRole.ADMIN,
        isSelected: false,
      },
    ]);
    expect(result.notifications).toEqual({
      pending: 2,
      sent24h: 9,
      failed24h: 1,
    });
    expect(result.auditFailures24h).toBe(3);
    expect(result.activeSessions).toBe(2);
    expect(result.resourceGroups.totalActive).toBe(2);
    expect(result.instances.totalActive).toBe(1);
    expect(result.currentSession).toEqual({
      ip: null,
      userAgent: null,
      observedAt: new Date("2026-03-05T08:30:00.000Z"),
      loginAt: new Date("2026-03-05T08:00:00.000Z"),
    });
    expect(["redis-local", "redis-upstash", "prisma-fallback"]).toContain(result.runtime.rateLimitBackend);
  });

  it("keeps dashboard available when tenant context resolution fails and logs audit", async () => {
    const logAudit = vi.fn(async () => {});
    const dependencies = createBaseDependencies({
      resolveTenantContext: vi.fn(async () => {
        throw new UserTenantContextError("TENANT_NOT_FOUND");
      }),
      logAudit,
    });

    const result = await getDashboardOverview({
      userId: "user_1",
      sessionExpiresAt: "2026-03-05T10:30:00.000Z",
    }, dependencies);

    expect(result.tenant).toBeNull();
    expect(result.tenantErrorCode).toBe("TENANT_NOT_FOUND");
    expect(result.tenantOptions).toHaveLength(2);
    expect(result.tenantOptions.every((option) => option.isSelected === false)).toBe(true);
    expect(logAudit).toHaveBeenCalledWith(
      "tenant_context_missing",
      "unknown",
      "user_1",
      expect.objectContaining({
        reason: "TENANT_NOT_FOUND",
        result: "FAILURE",
      }),
    );
  });

  it("keeps security timeline available while tenant-scoped aggregates stay fail-closed when tenant selection is required", async () => {
    const countUserNotificationByStatus = vi.fn(async () => 999);
    const countUserAuditFailuresSince = vi.fn(async () => 4);
    const listRecentUserAuditEvents = vi.fn(async () => ([
      {
        action: "login_success",
        result: "SUCCESS",
        reason: null,
        requestId: "req-2",
        ip: "88.236.40.120",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0",
        createdAt: new Date("2026-03-05T08:20:00.000Z"),
      },
    ]));
    const dependencies = createBaseDependencies({
      resolveTenantContext: vi.fn(async () => {
        throw new UserTenantContextError("TENANT_SELECTION_REQUIRED");
      }),
      countUserNotificationByStatus,
      countUserAuditFailuresSince,
      listRecentUserAuditEvents,
      listActiveResourceGroups: vi.fn(async () => []),
      listActiveInstances: vi.fn(async () => []),
      logAudit: vi.fn(async () => {}),
    });

    const result = await getDashboardOverview({
      userId: "user_1",
      sessionExpiresAt: "2026-03-05T10:30:00.000Z",
    }, dependencies);

    expect(result.tenant).toBeNull();
    expect(result.tenantErrorCode).toBe("TENANT_SELECTION_REQUIRED");
    expect(result.notifications).toEqual({
      pending: 0,
      sent24h: 0,
      failed24h: 0,
    });
    expect(result.auditFailures24h).toBe(4);
    expect(result.recentAuditEvents).toEqual([
      {
        action: "login_success",
        result: "SUCCESS",
        reason: null,
        requestId: "req-2",
        ip: "88.236.40.120",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0",
        createdAt: new Date("2026-03-05T08:20:00.000Z"),
      },
    ]);
    expect(result.resourceGroups).toEqual({
      totalActive: 0,
      recent: [],
    });
    expect(result.instances).toEqual({
      totalActive: 0,
      recent: [],
    });
    expect(countUserNotificationByStatus).not.toHaveBeenCalled();
    expect(countUserAuditFailuresSince).toHaveBeenCalledWith({
      userId: "user_1",
      since: new Date("2026-03-04T08:30:00.000Z"),
      excludeActions: ["tenant_selection_required"],
    });
    expect(listRecentUserAuditEvents).toHaveBeenCalledWith({
      userId: "user_1",
      take: 60,
      excludeActions: ["tenant_selection_required"],
    });
    expect(dependencies.logAudit).not.toHaveBeenCalled();
  });

  it("reports a lower-bound minimum of one active session for authenticated JWT context", async () => {
    const dependencies = createBaseDependencies({
      countUserActiveSessions: vi.fn(async () => 0),
    });

    const result = await getDashboardOverview({
      userId: "user_1",
      tenantId: "tenant_1",
      sessionExpiresAt: "2026-03-05T10:30:00.000Z",
    }, dependencies);

    expect(result.activeSessions).toBe(1);
  });
});

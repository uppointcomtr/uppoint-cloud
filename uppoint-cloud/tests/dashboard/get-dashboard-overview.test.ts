import { NotificationOutboxStatus, TenantRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  getDashboardOverview,
  type DashboardOverviewDependencies,
} from "@/modules/dashboard/server/get-dashboard-overview";
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

  it("fails closed for tenant-scoped aggregates when tenant selection is required", async () => {
    const countUserNotificationByStatus = vi.fn(async () => 999);
    const countUserAuditFailuresSince = vi.fn(async () => 999);
    const listRecentUserAuditEvents = vi.fn(async () => ([
      {
        action: "tenant_access_denied",
        result: "FAILURE",
        reason: "TENANT_SELECTION_REQUIRED",
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
    expect(result.auditFailures24h).toBe(0);
    expect(result.recentAuditEvents).toEqual([]);
    expect(countUserNotificationByStatus).not.toHaveBeenCalled();
    expect(countUserAuditFailuresSince).not.toHaveBeenCalled();
    expect(listRecentUserAuditEvents).not.toHaveBeenCalled();
  });

  it("reports at least one active session for authenticated JWT session context", async () => {
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

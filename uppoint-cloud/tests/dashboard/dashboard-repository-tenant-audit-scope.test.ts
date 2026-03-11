import { describe, expect, it, vi } from "vitest";

import {
  countUserAuditFailuresSince,
  listRecentUserAuditEvents,
} from "@/db/repositories/dashboard-repository";

describe("dashboard repository tenant audit scope", () => {
  it("includes account-level (tenantId=null) events when tenant context is selected for failure counts", async () => {
    const count = vi.fn(async () => 7);
    const fakeClient = {
      auditLog: {
        count,
      },
    };

    await countUserAuditFailuresSince(
      {
        userId: "user_1",
        tenantId: "tenant_1",
        since: new Date("2026-03-11T00:00:00.000Z"),
      },
      fakeClient as never,
    );

    expect(count).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        OR: [
          { tenantId: "tenant_1" },
          { tenantId: null },
        ],
        result: "FAILURE",
        createdAt: {
          gte: new Date("2026-03-11T00:00:00.000Z"),
        },
      },
    });
  });

  it("does not apply tenant OR scope when tenant context is not selected for failure counts", async () => {
    const count = vi.fn(async () => 4);
    const fakeClient = {
      auditLog: {
        count,
      },
    };

    await countUserAuditFailuresSince(
      {
        userId: "user_1",
        since: new Date("2026-03-11T00:00:00.000Z"),
      },
      fakeClient as never,
    );

    expect(count).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        result: "FAILURE",
        createdAt: {
          gte: new Date("2026-03-11T00:00:00.000Z"),
        },
      },
    });
  });

  it("includes account-level (tenantId=null) events when tenant context is selected for recent event list", async () => {
    const findMany = vi.fn(async () => []);
    const fakeClient = {
      auditLog: {
        findMany,
      },
    };

    await listRecentUserAuditEvents(
      {
        userId: "user_1",
        tenantId: "tenant_1",
        take: 25,
      },
      fakeClient as never,
    );

    expect(findMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        OR: [
          { tenantId: "tenant_1" },
          { tenantId: null },
        ],
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 25,
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
  });
});

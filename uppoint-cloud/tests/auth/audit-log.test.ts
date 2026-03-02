import { describe, expect, it, vi } from "vitest";

const { createAuditLog, findFirstAuditLog, headersMock } = vi.hoisted(() => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  findFirstAuditLog: vi.fn().mockResolvedValue(null),
  headersMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("@/db/client", () => ({
  prisma: {
    auditLog: {
      create: createAuditLog,
      findFirst: findFirstAuditLog,
    },
  },
}));

import { logAudit } from "@/lib/audit-log";

describe("logAudit", () => {
  it("persists normalized audit columns and redacts sensitive metadata", async () => {
    headersMock.mockResolvedValueOnce(
      new Headers({
        "x-request-id": "req-123",
        "x-real-ip": "203.0.113.10",
        "x-forwarded-for": "198.51.100.1, 203.0.113.10",
        "user-agent": "Vitest-UA",
      }),
    );

    await logAudit("password_reset_failed", "203.0.113.10", "user_1", {
      actorId: "actor_1",
      tenantId: "tenant_1",
      reason: "INVALID_CODE",
      targetUserId: "target_42",
      token: "plaintext-value",
    });

    expect(createAuditLog).toHaveBeenCalledTimes(1);
    expect(createAuditLog).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "password_reset_failed",
        ip: "203.0.113.10",
        userId: "user_1",
        actorId: "actor_1",
        targetId: "target_42",
        tenantId: "tenant_1",
        result: "FAILURE",
        reason: "INVALID_CODE",
        requestId: "req-123",
        userAgent: "Vitest-UA",
        forwardedFor: "198.51.100.1, 203.0.113.10",
        metadata: expect.objectContaining({
          token: "[REDACTED]",
          integrity: expect.objectContaining({
            version: "v1",
            hash: expect.stringMatching(/^[a-f0-9]{64}$/),
          }),
        }),
      }),
    });
  });

  it("infers success result for *_success actions", async () => {
    headersMock.mockResolvedValueOnce(new Headers());

    await logAudit("login_success", "203.0.113.11");

    expect(createAuditLog).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        action: "login_success",
        result: "SUCCESS",
      }),
    });
  });
});

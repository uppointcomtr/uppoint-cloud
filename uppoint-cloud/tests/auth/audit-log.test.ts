import { describe, expect, it, vi } from "vitest";

const { createAuditLog, headersMock } = vi.hoisted(() => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  headersMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("@/db/client", () => ({
  prisma: {
    auditLog: {
      create: createAuditLog,
    },
  },
}));

import { logAudit } from "@/lib/audit-log";

async function flushAsyncLogQueue(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

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

    logAudit("password_reset_failed", "203.0.113.10", "user_1", {
      reason: "INVALID_CODE",
      targetUserId: "target_42",
      token: "plaintext-value",
    });
    await flushAsyncLogQueue();

    expect(createAuditLog).toHaveBeenCalledTimes(1);
    expect(createAuditLog).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "password_reset_failed",
        ip: "203.0.113.10",
        userId: "user_1",
        actorId: "user_1",
        targetId: "target_42",
        result: "FAILURE",
        reason: "INVALID_CODE",
        requestId: "req-123",
        userAgent: "Vitest-UA",
        forwardedFor: "198.51.100.1, 203.0.113.10",
        metadata: expect.objectContaining({
          token: "[REDACTED]",
        }),
      }),
    });
  });

  it("infers success result for *_success actions", async () => {
    headersMock.mockResolvedValueOnce(new Headers());

    logAudit("login_success", "203.0.113.11");
    await flushAsyncLogQueue();

    expect(createAuditLog).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        action: "login_success",
        result: "SUCCESS",
      }),
    });
  });
});

import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withIdempotency: vi.fn(),
  enforceFailClosedIpRateLimit: vi.fn(),
  enforceFailClosedIdentifierRateLimit: vi.fn(),
  auth: vi.fn(),
  completeAccountDeleteChallenge: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/http/idempotency", () => ({
  withIdempotency: mocks.withIdempotency,
}));

vi.mock("@/lib/security/route-guard", () => ({
  enforceFailClosedIpRateLimit: mocks.enforceFailClosedIpRateLimit,
  enforceFailClosedIdentifierRateLimit: mocks.enforceFailClosedIdentifierRateLimit,
}));

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/modules/auth/server/account-delete-challenge", () => ({
  completeAccountDeleteChallenge: mocks.completeAccountDeleteChallenge,
}));

vi.mock("@/lib/audit-log", () => ({
  logAudit: mocks.logAudit,
}));

import * as accountDeleteRoute from "@/app/api/auth/account/delete/route";

describe("account delete route audit behavior", () => {
  it("emits only account_delete_success while user_soft_deleted stays in lifecycle service", async () => {
    mocks.withIdempotency.mockImplementation(async (_key: string, handler: () => Promise<Response>) => handler());
    mocks.enforceFailClosedIpRateLimit.mockResolvedValue({
      blockedResponse: null,
      ip: "203.0.113.10",
    });
    mocks.enforceFailClosedIdentifierRateLimit.mockResolvedValue(null);
    mocks.auth.mockResolvedValue({ user: { id: "user_1" } });
    mocks.completeAccountDeleteChallenge.mockResolvedValue({ userId: "user_1" });
    mocks.logAudit.mockResolvedValue(undefined);

    const response = await accountDeleteRoute.POST(
      new Request("https://cloud.uppoint.com.tr/api/auth/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          challengeId: "challenge_1",
          deleteToken: "x".repeat(64),
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { accepted: true },
    });
    expect(mocks.completeAccountDeleteChallenge).toHaveBeenCalledWith({
      challengeId: "challenge_1",
      deleteToken: "x".repeat(64),
      userId: "user_1",
    });
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      "account_delete_success",
      "203.0.113.10",
      "user_1",
      expect.objectContaining({
        step: "complete",
        result: "SUCCESS",
      }),
    );
    expect(mocks.logAudit).not.toHaveBeenCalledWith(
      "user_soft_deleted",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
});

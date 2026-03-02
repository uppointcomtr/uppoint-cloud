import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  deleteMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));

vi.mock("@/lib/env", () => ({
  env: {
    NODE_ENV: "production",
    UPSTASH_REDIS_REST_URL: undefined,
    UPSTASH_REDIS_REST_TOKEN: undefined,
    RATE_LIMIT_REDIS_URL: undefined,
  },
}));

vi.mock("@/db/client", () => ({
  prisma: {
    $transaction: mocks.transaction,
    rateLimitAttempt: {
      count: mocks.count,
      create: mocks.create,
      deleteMany: mocks.deleteMany,
    },
  },
}));

async function loadRateLimitModule() {
  vi.resetModules();
  return import("@/lib/rate-limit");
}

describe("withRateLimit context handling", () => {
  beforeEach(() => {
    mocks.headers.mockReset();
    mocks.count.mockReset();
    mocks.create.mockReset();
    mocks.deleteMany.mockReset();
    mocks.transaction.mockReset();
    mocks.transaction.mockImplementation(async (callback: (tx: {
      rateLimitAttempt: {
        count: typeof mocks.count;
        create: typeof mocks.create;
      };
    }) => Promise<boolean>) => callback({
      rateLimitAttempt: {
        count: mocks.count,
        create: mocks.create,
      },
    }));
  });

  it("fails closed in production when trusted client IP is missing", async () => {
    mocks.headers.mockResolvedValue(new Headers());

    const { withRateLimit } = await loadRateLimitModule();
    const response = await withRateLimit("login-email-start", 10, 900);

    expect(response).not.toBeNull();
    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({
      success: false,
      error: "RATE_LIMIT_CONTEXT_UNAVAILABLE",
    });
  });

  it("continues with limiter checks when trusted client IP exists", async () => {
    mocks.headers.mockResolvedValue(new Headers({
      "x-real-ip": "203.0.113.9",
    }));
    mocks.count.mockResolvedValue(0);
    mocks.create.mockResolvedValue({ id: "attempt_1" });
    mocks.deleteMany.mockResolvedValue({ count: 0 });

    const { withRateLimit } = await loadRateLimitModule();
    const response = await withRateLimit("login-email-start", 10, 900);

    expect(response).toBeNull();
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});

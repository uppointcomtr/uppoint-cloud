import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  create: vi.fn(),
  deleteMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
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

describe("checkRateLimit Prisma fallback", () => {
  beforeEach(() => {
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

  it("allows requests under limit and schedules deterministic cleanup only once per interval", async () => {
    mocks.count.mockResolvedValue(0);
    mocks.create.mockResolvedValue({ id: "attempt_1" });
    mocks.deleteMany.mockResolvedValue({ count: 3 });

    const { checkRateLimit } = await loadRateLimitModule();

    const first = await checkRateLimit("register", "127.0.0.1", 5, 60);
    const second = await checkRateLimit("register", "127.0.0.1", 5, 60);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("blocks requests when count is already at limit", async () => {
    mocks.count.mockResolvedValue(5);

    const { checkRateLimit } = await loadRateLimitModule();
    const result = await checkRateLimit("register", "127.0.0.1", 5, 60);

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(60);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

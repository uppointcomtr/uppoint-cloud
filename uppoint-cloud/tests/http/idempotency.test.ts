import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headersMock: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: mocks.headersMock,
}));

vi.mock("@/db/client", () => ({
  prisma: {
    idempotencyRecord: {
      findUnique: mocks.findUnique,
      create: mocks.create,
      updateMany: mocks.updateMany,
      upsert: mocks.upsert,
      deleteMany: mocks.deleteMany,
    },
  },
}));

async function loadIdempotencyModule() {
  vi.resetModules();
  return import("@/lib/http/idempotency");
}

describe("withIdempotency", () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    mutableEnv.NODE_ENV = originalNodeEnv;
    mocks.headersMock.mockReset();
    mocks.findUnique.mockReset();
    mocks.create.mockReset();
    mocks.updateMany.mockReset();
    mocks.upsert.mockReset();
    mocks.deleteMany.mockReset();
  });

  afterEach(() => {
    mutableEnv.NODE_ENV = originalNodeEnv;
  });

  it("returns cached response for identical idempotency key and subject", async () => {
    mocks.headersMock.mockResolvedValue(
      new Headers({
        "idempotency-key": "key-12345678",
        "x-real-ip": "203.0.113.10",
        "user-agent": "vitest-agent",
      }),
    );
    mocks.findUnique.mockResolvedValue({
      statusCode: 200,
      contentType: "application/json",
      body: "{\"cached\":true}",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const { withIdempotency } = await loadIdempotencyModule();
    const handler = vi.fn().mockResolvedValue(
      new Response("{\"cached\":false}", {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    const response = await withIdempotency("auth:test", handler);
    expect(handler).not.toHaveBeenCalled();
    expect(response.headers.get("X-Idempotency-Replayed")).toBe("true");
    expect(await response.json()).toEqual({ cached: true });
  });

  it("stores separate cache entries when request subject changes", async () => {
    mocks.findUnique.mockResolvedValue(null);
    mocks.create.mockResolvedValue(undefined);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.upsert.mockResolvedValue(undefined);
    const handler = vi.fn().mockResolvedValue(
      new Response("{\"ok\":true}", {
        status: 201,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    const { withIdempotency } = await loadIdempotencyModule();

    mocks.headersMock.mockResolvedValueOnce(
      new Headers({
        "idempotency-key": "key-12345678",
        "x-real-ip": "203.0.113.10",
        "user-agent": "agent-a",
      }),
    );
    await withIdempotency("auth:test", handler);

    mocks.headersMock.mockResolvedValueOnce(
      new Headers({
        "idempotency-key": "key-12345678",
        "x-real-ip": "203.0.113.20",
        "user-agent": "agent-b",
      }),
    );
    await withIdempotency("auth:test", handler);

    expect(mocks.create).toHaveBeenCalledTimes(2);
    const firstSubjectHash = mocks.create.mock.calls[0]?.[0]?.data?.subjectHash;
    const secondSubjectHash = mocks.create.mock.calls[1]?.[0]?.data?.subjectHash;
    expect(firstSubjectHash).toBeTruthy();
    expect(secondSubjectHash).toBeTruthy();
    expect(firstSubjectHash).not.toBe(secondSubjectHash);
  });

  it("rejects ambiguous global idempotency scope in production", async () => {
    mutableEnv.NODE_ENV = "production";
    mocks.headersMock.mockResolvedValue(
      new Headers({
        "idempotency-key": "key-12345678",
      }),
    );

    const { withIdempotency } = await loadIdempotencyModule();
    const handler = vi.fn().mockResolvedValue(new Response("{\"ok\":true}", { status: 200 }));

    const response = await withIdempotency("auth:test", handler);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "IDEMPOTENCY_SCOPE_UNRESOLVED",
      code: "IDEMPOTENCY_SCOPE_UNRESOLVED",
    });
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("fails closed when idempotency storage is unavailable", async () => {
    mocks.headersMock.mockResolvedValue(
      new Headers({
        "idempotency-key": "key-12345678",
        "x-real-ip": "203.0.113.10",
        "user-agent": "vitest-agent",
      }),
    );
    mocks.findUnique.mockResolvedValue(null);
    mocks.create.mockRejectedValue(new Error("storage unavailable"));

    const { withIdempotency } = await loadIdempotencyModule();
    const handler = vi.fn().mockResolvedValue(new Response("{\"ok\":true}", { status: 200 }));

    const response = await withIdempotency("auth:test", handler);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "IDEMPOTENCY_STORAGE_UNAVAILABLE",
      code: "IDEMPOTENCY_STORAGE_UNAVAILABLE",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("marks response when cache persistence fails after handler execution", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    mocks.headersMock.mockResolvedValue(
      new Headers({
        "idempotency-key": "key-12345678",
        "x-real-ip": "203.0.113.10",
        "user-agent": "vitest-agent",
      }),
    );
    mocks.findUnique.mockResolvedValue(null);
    mocks.create.mockResolvedValue(undefined);
    mocks.updateMany
      // persistResponse updateMany retries
      .mockRejectedValueOnce(new Error("persist failed"))
      .mockRejectedValueOnce(new Error("persist failed"))
      .mockRejectedValueOnce(new Error("persist failed"))
      // extendPendingReservationOnPersistFailure updateMany
      .mockResolvedValueOnce({ count: 1 });
    mocks.upsert.mockResolvedValue(undefined);

    const { withIdempotency } = await loadIdempotencyModule();
    const handler = vi.fn().mockResolvedValue(
      new Response("{\"ok\":true}", {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    const response = await withIdempotency("auth:test", handler);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Idempotency-Persisted")).toBe("false");
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[server-error] idempotency_persist_response_failed",
      expect.stringContaining("\"message\":\"persist failed\""),
    );
    consoleErrorSpy.mockRestore();
  });
});

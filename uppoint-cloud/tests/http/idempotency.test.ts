import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headersMock: vi.fn(),
  findUnique: vi.fn(),
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
  beforeEach(() => {
    mocks.headersMock.mockReset();
    mocks.findUnique.mockReset();
    mocks.upsert.mockReset();
    mocks.deleteMany.mockReset();
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

    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    const firstSubjectHash = mocks.upsert.mock.calls[0]?.[0]?.where?.action_key_subjectHash?.subjectHash;
    const secondSubjectHash = mocks.upsert.mock.calls[1]?.[0]?.where?.action_key_subjectHash?.subjectHash;
    expect(firstSubjectHash).toBeTruthy();
    expect(secondSubjectHash).toBeTruthy();
    expect(firstSubjectHash).not.toBe(secondSubjectHash);
  });
});

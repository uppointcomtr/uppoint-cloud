import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handler: vi.fn(),
  nextAuthFactory: vi.fn(),
  withRateLimit: vi.fn(),
  withRateLimitByIdentifier: vi.fn(),
  getClientIp: vi.fn(),
  logAudit: vi.fn(),
}));
mocks.nextAuthFactory.mockImplementation(() => mocks.handler);

vi.mock("next-auth", () => ({
  default: mocks.nextAuthFactory,
}));

vi.mock("@/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: mocks.withRateLimit,
  withRateLimitByIdentifier: mocks.withRateLimitByIdentifier,
  getClientIp: mocks.getClientIp,
}));

vi.mock("@/lib/audit-log", () => ({
  logAudit: mocks.logAudit,
}));

async function loadRouteModule() {
  vi.resetModules();
  return import("@/app/api/auth/[...nextauth]/route");
}

describe("nextauth POST rate-limit identifier", () => {
  beforeEach(() => {
    mocks.handler.mockReset();
    mocks.withRateLimit.mockReset();
    mocks.withRateLimitByIdentifier.mockReset();
    mocks.getClientIp.mockReset();
    mocks.logAudit.mockReset();

    mocks.handler.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.withRateLimitByIdentifier.mockResolvedValue(null);
    mocks.getClientIp.mockResolvedValue("203.0.113.21");
  });

  it("scopes secondary limiter key to action + client IP", async () => {
    const nextAuthRoute = await loadRouteModule();

    await nextAuthRoute.POST(
      new Request("https://cloud.uppoint.com.tr/api/auth/callback/credentials", { method: "POST" }),
      { params: Promise.resolve({ nextauth: ["callback", "credentials"] }) },
    );

    expect(mocks.withRateLimitByIdentifier).toHaveBeenCalledWith(
      "nextauth-post-action",
      "callback/credentials:203.0.113.21",
      120,
      60,
    );
  });
});

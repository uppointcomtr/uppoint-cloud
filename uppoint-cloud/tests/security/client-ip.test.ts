import { describe, expect, it } from "vitest";

import { resolveTrustedClientIp } from "@/lib/security/client-ip";

describe("resolveTrustedClientIp", () => {
  it("uses x-real-ip in production", () => {
    const resolved = resolveTrustedClientIp({
      realIpHeader: "203.0.113.10",
      forwardedForHeader: "198.51.100.1, 203.0.113.20",
      isProduction: true,
    });

    expect(resolved).toBe("203.0.113.10");
  });

  it("fails closed in production when x-real-ip is missing", () => {
    const resolved = resolveTrustedClientIp({
      realIpHeader: null,
      forwardedForHeader: "198.51.100.1, 203.0.113.20",
      isProduction: true,
    });

    expect(resolved).toBeNull();
  });

  it("falls back to x-forwarded-for in non-production", () => {
    const resolved = resolveTrustedClientIp({
      realIpHeader: null,
      forwardedForHeader: "198.51.100.1, 203.0.113.20",
      isProduction: false,
    });

    expect(resolved).toBe("203.0.113.20");
  });
});

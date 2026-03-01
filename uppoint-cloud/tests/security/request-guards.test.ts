import { describe, expect, it } from "vitest";

import {
  getRequestHost,
  isAllowedHost,
  isAllowedOrigin,
  resolveAllowedHosts,
  resolveAllowedOrigins,
} from "@/lib/security/request-guards";

describe("request guards", () => {
  it("resolves allowed hosts from app url and configured list", () => {
    const hosts = resolveAllowedHosts({
      appUrl: "https://cloud.uppoint.com.tr",
      configuredHosts: "api.uppoint.com.tr, cloud.uppoint.com.tr:443",
    });

    expect(hosts.has("cloud.uppoint.com.tr")).toBe(true);
    expect(hosts.has("api.uppoint.com.tr")).toBe(true);
    expect(hosts.has("cloud.uppoint.com.tr:443")).toBe(true);
  });

  it("resolves allowed origins from app url and configured list", () => {
    const origins = resolveAllowedOrigins({
      appUrl: "https://cloud.uppoint.com.tr",
      configuredOrigins: "https://portal.uppoint.com.tr, https://cloud.uppoint.com.tr",
    });

    expect(origins.has("https://cloud.uppoint.com.tr")).toBe(true);
    expect(origins.has("https://portal.uppoint.com.tr")).toBe(true);
  });

  it("parses request host from forwarded or direct host header", () => {
    const forwardedRequest = new Request("https://cloud.uppoint.com.tr/test", {
      headers: {
        "x-forwarded-host": "cloud.uppoint.com.tr, proxy.local",
      },
    });

    const directRequest = new Request("https://cloud.uppoint.com.tr/test", {
      headers: {
        host: "cloud.uppoint.com.tr",
      },
    });

    expect(getRequestHost(forwardedRequest)).toBe("cloud.uppoint.com.tr");
    expect(getRequestHost(directRequest)).toBe("cloud.uppoint.com.tr");
  });

  it("allows only configured hosts when list is non-empty", () => {
    const allowedHosts = new Set(["cloud.uppoint.com.tr"]);

    expect(isAllowedHost("cloud.uppoint.com.tr", allowedHosts)).toBe(true);
    expect(isAllowedHost("evil.example.com", allowedHosts)).toBe(false);
  });

  it("allows only configured origins when origin header exists", () => {
    const allowedOrigins = new Set(["https://cloud.uppoint.com.tr"]);

    expect(isAllowedOrigin("https://cloud.uppoint.com.tr", allowedOrigins)).toBe(true);
    expect(isAllowedOrigin("https://evil.example.com", allowedOrigins)).toBe(false);
    expect(isAllowedOrigin(null, allowedOrigins)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import {
  getRequestHost,
  hasConflictingForwardedHost,
  isAllowedHost,
  isAllowedOrigin,
  isLoopbackHost,
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

  it("parses request host from host header only", () => {
    const forwardedOnlyRequest = new Request("https://cloud.uppoint.com.tr/test", {
      headers: {
        "x-forwarded-host": "cloud.uppoint.com.tr, proxy.local",
      },
    });

    const directRequest = new Request("https://cloud.uppoint.com.tr/test", {
      headers: {
        host: "cloud.uppoint.com.tr",
      },
    });

    expect(getRequestHost(forwardedOnlyRequest)).toBeNull();
    expect(getRequestHost(directRequest)).toBe("cloud.uppoint.com.tr");
  });

  it("detects conflicting forwarded host values", () => {
    const matchingRequest = new Request("https://cloud.uppoint.com.tr/test", {
      headers: {
        host: "cloud.uppoint.com.tr",
        "x-forwarded-host": "cloud.uppoint.com.tr",
      },
    });

    const conflictingRequest = new Request("https://cloud.uppoint.com.tr/test", {
      headers: {
        host: "cloud.uppoint.com.tr",
        "x-forwarded-host": "evil.example.com",
      },
    });

    expect(hasConflictingForwardedHost(matchingRequest)).toBe(false);
    expect(hasConflictingForwardedHost(conflictingRequest)).toBe(true);
  });

  it("allows only configured hosts when list is non-empty", () => {
    const allowedHosts = new Set(["cloud.uppoint.com.tr"]);

    expect(isAllowedHost("cloud.uppoint.com.tr", allowedHosts)).toBe(true);
    expect(isAllowedHost("evil.example.com", allowedHosts)).toBe(false);
  });

  it("allows only configured origins and rejects missing origin when allowlist is active", () => {
    const allowedOrigins = new Set(["https://cloud.uppoint.com.tr"]);

    expect(isAllowedOrigin("https://cloud.uppoint.com.tr", allowedOrigins)).toBe(true);
    expect(isAllowedOrigin("https://evil.example.com", allowedOrigins)).toBe(false);
    expect(isAllowedOrigin(null, allowedOrigins)).toBe(false);
  });

  it("recognizes loopback hosts with or without ports", () => {
    expect(isLoopbackHost("127.0.0.1:3000")).toBe(true);
    expect(isLoopbackHost("localhost:3000")).toBe(true);
    expect(isLoopbackHost("[::1]:3000")).toBe(true);
    expect(isLoopbackHost("cloud.uppoint.com.tr")).toBe(false);
    expect(isLoopbackHost(null)).toBe(false);
  });
});

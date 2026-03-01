import { describe, expect, it } from "vitest";

import { resolveAuthRedirect, shouldPreserveCallbackUrl } from "@/modules/auth/server/route-access";

describe("resolveAuthRedirect", () => {
  it("redirects unauthenticated dashboard requests to locale login", () => {
    expect(resolveAuthRedirect("/tr/dashboard", false)).toBe("/tr/login");
    expect(resolveAuthRedirect("/en/dashboard/projects", false)).toBe("/en/login");
  });

  it("redirects authenticated auth-page requests to locale dashboard", () => {
    expect(resolveAuthRedirect("/tr/login", true)).toBe("/tr/dashboard");
    expect(resolveAuthRedirect("/en/register", true)).toBe("/en/dashboard");
  });

  it("falls back to default locale for non-prefixed protected routes", () => {
    expect(resolveAuthRedirect("/dashboard", false)).toBe("/tr/login");
  });

  it("allows non-protected routes", () => {
    expect(resolveAuthRedirect("/", false)).toBeNull();
    expect(resolveAuthRedirect("/tr", false)).toBeNull();
    expect(resolveAuthRedirect("/tr/forgot-password", true)).toBeNull();
    expect(resolveAuthRedirect("/en/reset-password", true)).toBeNull();
  });
});

describe("shouldPreserveCallbackUrl", () => {
  it("returns true for protected routes configured with callback preservation", () => {
    expect(shouldPreserveCallbackUrl("/dashboard")).toBe(true);
    expect(shouldPreserveCallbackUrl("/dashboard/instances")).toBe(true);
  });

  it("returns false for public/auth routes", () => {
    expect(shouldPreserveCallbackUrl("/login")).toBe(false);
    expect(shouldPreserveCallbackUrl("/register")).toBe(false);
    expect(shouldPreserveCallbackUrl("/")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import {
  hasExplicitProtectedRouteRule,
  resolveAuthRedirect,
  shouldPreserveCallbackUrl,
} from "@/modules/auth/server/route-access";

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

  it("treats unknown pages as protected by default", () => {
    expect(resolveAuthRedirect("/tr/settings", false)).toBe("/tr/login");
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

  it("preserves callback for non-public protected routes", () => {
    expect(shouldPreserveCallbackUrl("/settings")).toBe(true);
  });
});

describe("protected route intent", () => {
  it("matches explicit protected route registry", () => {
    expect(hasExplicitProtectedRouteRule("/dashboard")).toBe(true);
    expect(hasExplicitProtectedRouteRule("/dashboard/instances")).toBe(true);
  });

  it("keeps unknown paths protected while requiring explicit registry for route intent", () => {
    expect(hasExplicitProtectedRouteRule("/settings")).toBe(false);
  });
});

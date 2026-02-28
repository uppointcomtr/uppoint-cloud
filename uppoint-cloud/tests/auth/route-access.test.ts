import { describe, expect, it } from "vitest";

import { resolveAuthRedirect } from "@/modules/auth/server/route-access";

describe("resolveAuthRedirect", () => {
  it("redirects unauthenticated dashboard requests to locale login", () => {
    expect(resolveAuthRedirect("/tr/dashboard", false)).toBe("/tr/login");
    expect(resolveAuthRedirect("/en/dashboard/projects", false)).toBe("/en/login");
  });

  it("redirects authenticated auth-page requests to locale dashboard", () => {
    expect(resolveAuthRedirect("/tr/login", true)).toBe("/tr/dashboard");
    expect(resolveAuthRedirect("/en/register", true)).toBe("/en/dashboard");
    expect(resolveAuthRedirect("/tr/forgot-password", true)).toBe("/tr/dashboard");
  });

  it("falls back to default locale for non-prefixed protected routes", () => {
    expect(resolveAuthRedirect("/dashboard", false)).toBe("/tr/login");
  });

  it("allows non-protected routes", () => {
    expect(resolveAuthRedirect("/", false)).toBeNull();
    expect(resolveAuthRedirect("/tr", false)).toBeNull();
  });
});

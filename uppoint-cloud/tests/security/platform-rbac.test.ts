import { describe, expect, it } from "vitest";

import {
  assertPlatformAccess,
  hasPlatformPermission,
  PlatformAccessError,
} from "@/modules/auth/server/platform-rbac";

describe("platform RBAC primitives", () => {
  it("exposes deny-by-default permission checks", () => {
    expect(hasPlatformPermission("SUPPORT", "platform:audit:read")).toBe(true);
    expect(hasPlatformPermission("SUPPORT", "platform:users:manage")).toBe(false);
  });

  it("throws when role is missing or insufficient", () => {
    expect(() => assertPlatformAccess({
      role: null,
      permission: "platform:audit:read",
    })).toThrowError(PlatformAccessError);

    expect(() => assertPlatformAccess({
      role: "SECURITY",
      permission: "platform:users:manage",
    })).toThrowError(PlatformAccessError);
  });

  it("allows access when role has required permission", () => {
    expect(() => assertPlatformAccess({
      role: "PLATFORM_ADMIN",
      permission: "platform:users:manage",
    })).not.toThrow();
  });
});

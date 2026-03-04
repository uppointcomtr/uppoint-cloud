import "server-only";

export type PlatformRole =
  | "SUPPORT"
  | "SECURITY"
  | "PLATFORM_ADMIN";

export type PlatformPermission =
  | "platform:audit:read"
  | "platform:users:manage"
  | "platform:tenants:manage"
  | "platform:security:respond";

const ROLE_PERMISSIONS: Record<PlatformRole, ReadonlySet<PlatformPermission>> = {
  SUPPORT: new Set<PlatformPermission>([
    "platform:audit:read",
  ]),
  SECURITY: new Set<PlatformPermission>([
    "platform:audit:read",
    "platform:security:respond",
  ]),
  PLATFORM_ADMIN: new Set<PlatformPermission>([
    "platform:audit:read",
    "platform:users:manage",
    "platform:tenants:manage",
    "platform:security:respond",
  ]),
};

export class PlatformAccessError extends Error {
  constructor(public readonly code: "PLATFORM_ACCESS_DENIED") {
    super(code);
    this.name = "PlatformAccessError";
  }
}

export function hasPlatformPermission(
  role: PlatformRole,
  permission: PlatformPermission,
): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function assertPlatformAccess(input: {
  role: PlatformRole | null | undefined;
  permission: PlatformPermission;
}): void {
  if (!input.role || !hasPlatformPermission(input.role, input.permission)) {
    throw new PlatformAccessError("PLATFORM_ACCESS_DENIED");
  }
}

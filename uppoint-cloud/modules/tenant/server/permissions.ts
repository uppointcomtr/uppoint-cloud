import "server-only";

import { TenantRole } from "@prisma/client";

export type TenantPermission =
  | "tenant:read"
  | "tenant:manage_members"
  | "tenant:manage_billing"
  | "tenant:manage_infrastructure";

const ROLE_PERMISSIONS: Record<TenantRole, ReadonlySet<TenantPermission>> = {
  MEMBER: new Set<TenantPermission>([
    "tenant:read",
  ]),
  ADMIN: new Set<TenantPermission>([
    "tenant:read",
    "tenant:manage_members",
    "tenant:manage_infrastructure",
  ]),
  OWNER: new Set<TenantPermission>([
    "tenant:read",
    "tenant:manage_members",
    "tenant:manage_billing",
    "tenant:manage_infrastructure",
  ]),
};

const MINIMUM_ROLE_PERMISSION: Record<TenantRole, TenantPermission> = {
  MEMBER: "tenant:read",
  ADMIN: "tenant:manage_members",
  OWNER: "tenant:manage_billing",
};

export function hasTenantPermission(role: TenantRole, permission: TenantPermission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function hasRequiredTenantRole(role: TenantRole, minimumRole: TenantRole): boolean {
  return hasTenantPermission(role, MINIMUM_ROLE_PERMISSION[minimumRole]);
}

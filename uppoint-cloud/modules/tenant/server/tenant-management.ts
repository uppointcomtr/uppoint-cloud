import "server-only";

import { randomBytes } from "crypto";
import { Prisma, TenantRole } from "@prisma/client";
import { z } from "zod";

import { listActiveResourceGroupsForTenant } from "@/db/repositories/instance-control-plane-repository";
import {
  createTenantWithOwnerMembership,
  findUserTenantMembershipsForContext,
  listUserTenantMembershipsForManagement,
  softDeleteTenantIfActive,
} from "@/db/repositories/tenant-repository";
import { type TenantPermission, hasTenantPermission } from "@/modules/tenant/server/permissions";
import { assertTenantAccess } from "@/modules/tenant/server/scope";

const createTenantInputSchema = z.object({
  userId: z.string().trim().min(1).max(191),
  name: z.string().trim().min(3).max(80),
});

const TENANT_SLUG_MAX_LENGTH = 48;
const TENANT_CREATE_MAX_RETRIES = 5;
const TENANT_SLUG_SUFFIX_LENGTH_BYTES = 4;

interface CreateTenantDependencies {
  createTenant: typeof createTenantWithOwnerMembership;
  createSlugSuffix: () => string;
}

interface TenantDetailDependencies {
  assertAccess: (input: {
    tenantId: string;
    userId: string;
    minimumRole: TenantRole;
  }) => Promise<{ tenantId: string; role: TenantRole }>;
  listResourceGroups: typeof listActiveResourceGroupsForTenant;
}

interface DeleteTenantDependencies extends TenantDetailDependencies {
  softDeleteTenant: typeof softDeleteTenantIfActive;
  listMemberships: typeof findUserTenantMembershipsForContext;
  now: () => Date;
}

interface TenantManagementListDependencies {
  listMembershipsForManagement: typeof listUserTenantMembershipsForManagement;
}

const defaultDependencies: CreateTenantDependencies = {
  createTenant: async (input) => createTenantWithOwnerMembership(input),
  createSlugSuffix: () => randomBytes(TENANT_SLUG_SUFFIX_LENGTH_BYTES).toString("hex"),
};

const defaultTenantDetailDependencies: TenantDetailDependencies = {
  assertAccess: async ({ tenantId, userId, minimumRole }) =>
    assertTenantAccess({ tenantId, userId, minimumRole }),
  listResourceGroups: async ({ tenantId, take }) =>
    listActiveResourceGroupsForTenant({ tenantId, take }),
};

const defaultDeleteTenantDependencies: DeleteTenantDependencies = {
  ...defaultTenantDetailDependencies,
  softDeleteTenant: async ({ tenantId, now }) =>
    softDeleteTenantIfActive({ tenantId, now }),
  listMemberships: async ({ userId, take }) =>
    findUserTenantMembershipsForContext({ userId, take }),
  now: () => new Date(),
};

const defaultTenantManagementListDependencies: TenantManagementListDependencies = {
  listMembershipsForManagement: async ({ userId, take }) =>
    listUserTenantMembershipsForManagement({ userId, take }),
};

const tenantManagementScopeSchema = z.object({
  userId: z.string().trim().min(1).max(191),
  tenantId: z.string().trim().min(1).max(191),
});
const tenantManagementListInputSchema = z.object({
  userId: z.string().trim().min(1).max(191),
  take: z.number().int().min(1).max(100).optional(),
});

const TENANT_DETAIL_RESOURCE_GROUP_TAKE = 24;

const TENANT_PERMISSION_ORDER: TenantPermission[] = [
  "tenant:read",
  "tenant:manage_members",
  "tenant:manage_infrastructure",
  "tenant:manage_billing",
];

export class TenantManagementError extends Error {
  constructor(
    public readonly code:
      | "TENANT_CREATE_FAILED"
      | "TENANT_SLUG_RETRY_EXHAUSTED"
      | "TENANT_DETAIL_ACCESS_DENIED"
      | "TENANT_DELETE_DISABLED"
      | "TENANT_DELETE_FORBIDDEN_ROLE"
      | "TENANT_DELETE_BLOCKED_RESOURCE_GROUPS"
      | "TENANT_DELETE_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "TenantManagementError";
  }
}

export interface TenantManagementDetail {
  tenantId: string;
  role: TenantRole;
  permissions: TenantPermission[];
  resourceGroups: Array<{
    id: string;
    tenantId: string;
    name: string;
    slug: string;
    regionCode: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  canDelete: boolean;
  deleteBlockedReason: "RESOURCE_GROUPS_PRESENT" | "ROLE_INSUFFICIENT" | "DELETE_DISABLED" | null;
}

export interface TenantManagementMembershipRow {
  tenantId: string;
  tenantName: string;
  role: TenantRole;
  tenantDeletedAt: Date | null;
}

function normalizeSlugBase(name: string): string {
  const ascii = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  const normalized = ascii
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");

  return normalized.length > 0 ? normalized : "tenant";
}

function buildTenantSlug(name: string, suffixRaw: string): string {
  const suffix = suffixRaw
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12);
  const safeSuffix = suffix.length > 0 ? suffix : "seed";
  const base = normalizeSlugBase(name);
  const maxBaseLength = Math.max(1, TENANT_SLUG_MAX_LENGTH - safeSuffix.length - 1);
  const trimmedBase = base.slice(0, maxBaseLength).replace(/-+$/, "");
  const safeBase = trimmedBase.length > 0 ? trimmedBase : "tenant";

  return `${safeBase}-${safeSuffix}`;
}

function includesSlugTarget(target: unknown): boolean {
  if (Array.isArray(target)) {
    return target.some((entry) => typeof entry === "string" && entry.toLowerCase().includes("slug"));
  }

  if (typeof target === "string") {
    return target.toLowerCase().includes("slug");
  }

  return false;
}

function isTenantSlugConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code !== "P2002") {
      return false;
    }

    const target = error.meta?.target;
    return target ? includesSlugTarget(target) : true;
  }

  if (typeof error !== "object" || error === null) {
    return false;
  }

  const maybeCode = "code" in error ? (error as { code?: unknown }).code : null;
  if (maybeCode !== "P2002") {
    return false;
  }

  const maybeMeta = "meta" in error ? (error as { meta?: { target?: unknown } }).meta : undefined;
  return maybeMeta?.target ? includesSlugTarget(maybeMeta.target) : true;
}

export async function createTenantForUser(
  rawInput: unknown,
  dependencies: CreateTenantDependencies = defaultDependencies,
): Promise<{ id: string; slug: string; name: string }> {
  const input = createTenantInputSchema.parse(rawInput);

  for (let attempt = 0; attempt < TENANT_CREATE_MAX_RETRIES; attempt += 1) {
    const slug = buildTenantSlug(input.name, dependencies.createSlugSuffix());

    try {
      return await dependencies.createTenant({
        userId: input.userId,
        name: input.name,
        slug,
      });
    } catch (error) {
      if (isTenantSlugConflict(error)) {
        continue;
      }

      throw new TenantManagementError("TENANT_CREATE_FAILED", "Tenant could not be created");
    }
  }

  throw new TenantManagementError("TENANT_SLUG_RETRY_EXHAUSTED", "Tenant slug generation retry exhausted");
}

export async function getTenantManagementDetailForUser(
  rawInput: unknown,
  dependencies: TenantDetailDependencies = defaultTenantDetailDependencies,
): Promise<TenantManagementDetail> {
  const input = tenantManagementScopeSchema.parse(rawInput);
  let access: { tenantId: string; role: TenantRole };

  try {
    access = await dependencies.assertAccess({
      tenantId: input.tenantId,
      userId: input.userId,
      minimumRole: TenantRole.MEMBER,
    });
  } catch {
    throw new TenantManagementError("TENANT_DETAIL_ACCESS_DENIED", "Tenant detail access denied");
  }

  const resourceGroups = await dependencies.listResourceGroups({
    tenantId: input.tenantId,
    take: TENANT_DETAIL_RESOURCE_GROUP_TAKE,
  });
  const canDelete = access.role === TenantRole.OWNER && resourceGroups.length === 0;
  const deleteBlockedReason: TenantManagementDetail["deleteBlockedReason"] = access.role !== TenantRole.OWNER
    ? "ROLE_INSUFFICIENT"
    : resourceGroups.length > 0
      ? "RESOURCE_GROUPS_PRESENT"
      : null;

  return {
    tenantId: access.tenantId,
    role: access.role,
    permissions: TENANT_PERMISSION_ORDER.filter((permission) => hasTenantPermission(access.role, permission)),
    resourceGroups,
    canDelete,
    deleteBlockedReason,
  };
}

export async function deleteTenantForUser(
  rawInput: unknown,
  dependencies: DeleteTenantDependencies = defaultDeleteTenantDependencies,
): Promise<{ deletedTenantId: string; nextTenantId: string | null }> {
  const input = tenantManagementScopeSchema.parse(rawInput);
  let access: { tenantId: string; role: TenantRole };

  try {
    access = await dependencies.assertAccess({
      tenantId: input.tenantId,
      userId: input.userId,
      minimumRole: TenantRole.MEMBER,
    });
  } catch {
    throw new TenantManagementError("TENANT_DELETE_FORBIDDEN_ROLE", "Tenant cancel requires owner role");
  }

  if (access.role !== TenantRole.OWNER) {
    throw new TenantManagementError("TENANT_DELETE_FORBIDDEN_ROLE", "Tenant cancel requires owner role");
  }

  const resourceGroups = await dependencies.listResourceGroups({
    tenantId: input.tenantId,
    take: 1,
  });

  if (resourceGroups.length > 0) {
    throw new TenantManagementError(
      "TENANT_DELETE_BLOCKED_RESOURCE_GROUPS",
      "Tenant cancel is blocked while resource groups are attached",
    );
  }

  try {
    await dependencies.softDeleteTenant({
      tenantId: input.tenantId,
      now: dependencies.now(),
    });
  } catch {
    throw new TenantManagementError("TENANT_DELETE_FAILED", "Tenant cancel failed");
  }

  const memberships = await dependencies.listMemberships({
    userId: input.userId,
    take: 2,
  });
  const nextTenant = memberships.find((membership) => membership.tenantId !== input.tenantId);

  return {
    deletedTenantId: input.tenantId,
    nextTenantId: nextTenant?.tenantId ?? memberships[0]?.tenantId ?? null,
  };
}

export async function listTenantManagementMembershipsForUser(
  rawInput: unknown,
  dependencies: TenantManagementListDependencies = defaultTenantManagementListDependencies,
): Promise<TenantManagementMembershipRow[]> {
  const input = tenantManagementListInputSchema.parse(rawInput);

  return dependencies.listMembershipsForManagement({
    userId: input.userId,
    take: input.take ?? 50,
  });
}

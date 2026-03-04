import "server-only";

import { TenantRole } from "@prisma/client";

import { findTenantMembershipForAccess } from "@/db/repositories/tenant-repository";
import { logAudit } from "@/lib/audit-log";
import { hasRequiredTenantRole } from "@/modules/tenant/server/permissions";

interface TenantScopeDependencies {
  findMembership: (input: { tenantId: string; userId: string }) => Promise<{
    tenantId: string;
    userId: string;
    role: TenantRole;
    tenant: {
      deletedAt: Date | null;
    };
  } | null>;
}

const defaultDependencies: TenantScopeDependencies = {
  findMembership: async ({ tenantId, userId }) => findTenantMembershipForAccess({ tenantId, userId }),
};

interface TenantAccessAuditContext {
  ip?: string;
  requestId?: string;
  userAgent?: string;
  forwardedFor?: string;
}

export async function assertTenantAccess(
  input: {
    tenantId: string;
    userId: string;
    minimumRole?: TenantRole;
    auditContext?: TenantAccessAuditContext;
  },
  dependencies: TenantScopeDependencies = defaultDependencies,
): Promise<{ tenantId: string; userId: string; role: TenantRole }> {
  const auditIp = input.auditContext?.ip?.trim() || "unknown";
  const auditMetadata = {
    requestId: input.auditContext?.requestId,
    userAgent: input.auditContext?.userAgent,
    forwardedFor: input.auditContext?.forwardedFor,
  };

  const membership = await dependencies.findMembership({
    tenantId: input.tenantId,
    userId: input.userId,
  });

  if (!membership || membership.tenant.deletedAt) {
    await logAudit("tenant_access_denied", auditIp, input.userId, {
      targetId: input.tenantId,
      reason: "TENANT_ACCESS_DENIED",
      result: "FAILURE",
      ...auditMetadata,
    }, input.tenantId);
    throw new Error("TENANT_ACCESS_DENIED");
  }

  const minimumRole = input.minimumRole ?? TenantRole.MEMBER;

  if (!hasRequiredTenantRole(membership.role, minimumRole)) {
    await logAudit("tenant_role_insufficient", auditIp, input.userId, {
      targetId: membership.tenantId,
      reason: "TENANT_ROLE_INSUFFICIENT",
      minimumRole,
      role: membership.role,
      result: "FAILURE",
      ...auditMetadata,
    }, membership.tenantId);
    throw new Error("TENANT_ROLE_INSUFFICIENT");
  }

  return {
    tenantId: membership.tenantId,
    userId: membership.userId,
    role: membership.role,
  };
}

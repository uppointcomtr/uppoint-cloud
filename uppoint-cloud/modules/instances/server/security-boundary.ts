import "server-only";

import { TenantRole } from "@prisma/client";

import { assertTenantAccess } from "@/modules/tenant/server/scope";

export interface InstanceTenantAccessInput {
  tenantId: string;
  userId: string;
  minimumRole?: TenantRole;
}

export async function assertInstanceTenantAccess(
  input: InstanceTenantAccessInput,
): Promise<{ tenantId: string; userId: string; role: TenantRole }> {
  return assertTenantAccess({
    tenantId: input.tenantId,
    userId: input.userId,
    minimumRole: input.minimumRole ?? TenantRole.ADMIN,
  });
}

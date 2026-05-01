import "server-only";

import { TenantRole } from "@prisma/client";

import { listResourceGroupHierarchyForTenant } from "@/db/repositories/instance-control-plane-repository";
import type { InstanceResourceGroupHierarchyView } from "@/modules/instances/domain/contracts";
import { assertTenantAccess } from "@/modules/tenant/server/scope";

interface ResourceGroupHierarchyDependencies {
  assertAccess: typeof assertTenantAccess;
  listHierarchy: typeof listResourceGroupHierarchyForTenant;
  now: () => Date;
}

const defaultDependencies: ResourceGroupHierarchyDependencies = {
  assertAccess: assertTenantAccess,
  listHierarchy: listResourceGroupHierarchyForTenant,
  now: () => new Date(),
};

export async function getInstanceResourceGroupHierarchy(
  input: {
    userId: string;
    tenantId: string;
  },
  dependencies: ResourceGroupHierarchyDependencies = defaultDependencies,
): Promise<InstanceResourceGroupHierarchyView> {
  const { assertAccess: assertTenantAccess } = dependencies;

  await assertTenantAccess({
    tenantId: input.tenantId,
    userId: input.userId,
    minimumRole: TenantRole.MEMBER,
  });

  const resourceGroups = await dependencies.listHierarchy({
    tenantId: input.tenantId,
  });

  return {
    tenantId: input.tenantId,
    generatedAt: dependencies.now(),
    resourceGroups,
  };
}

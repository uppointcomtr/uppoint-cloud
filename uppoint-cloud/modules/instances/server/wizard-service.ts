import "server-only";

import { createHash } from "crypto";
import { TenantRole } from "@prisma/client";
import { z } from "zod";

import {
  createProvisioningRequest,
  createResourceGroupWithDefaults,
  findActiveFirewallPolicyForTenant,
  findActiveNetworkForTenant,
  findActiveResourceGroupForTenant,
  listActiveFirewallPoliciesForTenant,
  listActiveNetworksForTenant,
  listActiveResourceGroupsForTenant,
} from "@/db/repositories/instance-control-plane-repository";
import { listActiveUserTenantMembershipOptions } from "@/db/repositories/dashboard-repository";
import { logAudit } from "@/lib/audit-log";
import {
  findImageByCode,
  findPlanByCode,
  findRegionByCode,
  IMAGE_CATALOG,
  PLAN_CATALOG,
  REGION_CATALOG,
} from "@/modules/instances/domain/catalog";
import type {
  FirewallPolicyView,
  InstanceProvisioningJob,
  ResourceGroupView,
  VirtualNetworkView,
} from "@/modules/instances/domain/contracts";
import {
  createResourceGroupSchema,
  submitInstanceProvisioningSchema,
} from "@/modules/instances/schemas/wizard-schemas";
import { assertInstanceTenantAccess } from "@/modules/instances/server/security-boundary";
import { resolveUserTenantContext } from "@/modules/tenant/server/user-tenant";

export interface WizardTenantOption {
  tenantId: string;
  tenantName: string;
  role: TenantRole;
  isSelected: boolean;
}

export interface InstanceWizardBootstrap {
  selectedTenantId: string;
  selectedTenantRole: TenantRole;
  tenantOptions: WizardTenantOption[];
  resourceGroups: ResourceGroupView[];
  networks: VirtualNetworkView[];
  firewallPolicies: FirewallPolicyView[];
  planCatalog: typeof PLAN_CATALOG;
  imageCatalog: typeof IMAGE_CATALOG;
  regionCatalog: typeof REGION_CATALOG;
}

export class InstanceWizardError extends Error {
  constructor(
    public readonly code:
      | "TENANT_ACCESS_DENIED"
      | "RESOURCE_GROUP_NOT_FOUND"
      | "NETWORK_NOT_FOUND"
      | "FIREWALL_POLICY_NOT_FOUND"
      | "NETWORK_RESOURCE_GROUP_MISMATCH"
      | "FIREWALL_RESOURCE_GROUP_MISMATCH"
      | "RESOURCE_GROUP_REGION_MISMATCH"
      | "PLAN_NOT_FOUND"
      | "IMAGE_NOT_FOUND"
      | "REGION_NOT_FOUND"
      | "PROVISIONING_REQUEST_INVALID"
      | "RESOURCE_GROUP_CREATE_FAILED"
      | "UNKNOWN",
    message: string,
  ) {
    super(message);
    this.name = "InstanceWizardError";
  }
}

interface WizardDependencies {
  resolveTenantContext: typeof resolveUserTenantContext;
  assertInstanceTenantAccess: typeof assertInstanceTenantAccess;
  listTenantOptions: typeof listActiveUserTenantMembershipOptions;
  listResourceGroups: typeof listActiveResourceGroupsForTenant;
  listNetworks: typeof listActiveNetworksForTenant;
  listFirewallPolicies: typeof listActiveFirewallPoliciesForTenant;
  findResourceGroup: typeof findActiveResourceGroupForTenant;
  findNetwork: typeof findActiveNetworkForTenant;
  findFirewallPolicy: typeof findActiveFirewallPolicyForTenant;
  createResourceGroup: typeof createResourceGroupWithDefaults;
  createProvisioningRequest: typeof createProvisioningRequest;
  logAudit: typeof logAudit;
}

const defaultDependencies: WizardDependencies = {
  resolveTenantContext: async (input) => resolveUserTenantContext(input),
  assertInstanceTenantAccess: async (input) => assertInstanceTenantAccess(input),
  listTenantOptions: async (input) => listActiveUserTenantMembershipOptions(input),
  listResourceGroups: async (input) => listActiveResourceGroupsForTenant(input),
  listNetworks: async (input) => listActiveNetworksForTenant(input),
  listFirewallPolicies: async (input) => listActiveFirewallPoliciesForTenant(input),
  findResourceGroup: async (input) => findActiveResourceGroupForTenant(input),
  findNetwork: async (input) => findActiveNetworkForTenant(input),
  findFirewallPolicy: async (input) => findActiveFirewallPolicyForTenant(input),
  createResourceGroup: async (input) => createResourceGroupWithDefaults(input),
  createProvisioningRequest: async (input) => createProvisioningRequest(input),
  logAudit,
};

function buildDefaultNetworkCidr(tenantId: string, slug: string): string {
  const digest = createHash("sha256").update(`${tenantId}:${slug}`).digest();
  const octetA = 10 + (digest[0] ?? 0) % 200;
  const octetB = 1 + (digest[1] ?? 0) % 200;
  return `10.${octetA}.${octetB}.0/24`;
}

function parseProvisioningInput(rawInput: unknown) {
  const parsed = submitInstanceProvisioningSchema.parse(rawInput);
  return {
    ...parsed,
    sshPublicKey: parsed.sshPublicKey && parsed.sshPublicKey.length > 0
      ? parsed.sshPublicKey
      : null,
  };
}

function resolveAuditIp(ip: string | null | undefined): string {
  const normalized = ip?.trim();
  return normalized && normalized.length > 0 ? normalized : "unknown";
}

export async function getInstanceWizardBootstrap(
  input: { userId: string; tenantId?: string },
  dependencies: WizardDependencies = defaultDependencies,
): Promise<InstanceWizardBootstrap> {
  const selectedTenant = await dependencies.resolveTenantContext({
    userId: input.userId,
    tenantId: input.tenantId,
    minimumRole: TenantRole.MEMBER,
  });

  const [tenantOptionsRaw, resourceGroups, networks, firewallPolicies] = await Promise.all([
    dependencies.listTenantOptions({ userId: input.userId, take: 20 }),
    dependencies.listResourceGroups({ tenantId: selectedTenant.tenantId, take: 100 }),
    dependencies.listNetworks({ tenantId: selectedTenant.tenantId, take: 200 }),
    dependencies.listFirewallPolicies({ tenantId: selectedTenant.tenantId, take: 200 }),
  ]);

  const tenantOptions = tenantOptionsRaw.map((option) => ({
    ...option,
    isSelected: option.tenantId === selectedTenant.tenantId,
  }));

  return {
    selectedTenantId: selectedTenant.tenantId,
    selectedTenantRole: selectedTenant.role,
    tenantOptions,
    resourceGroups,
    networks,
    firewallPolicies,
    planCatalog: PLAN_CATALOG,
    imageCatalog: IMAGE_CATALOG,
    regionCatalog: REGION_CATALOG,
  };
}

export async function createResourceGroupFromWizard(
  rawInput: unknown,
  context: { userId: string; ip?: string | null },
  dependencies: WizardDependencies = defaultDependencies,
): Promise<{
  resourceGroup: ResourceGroupView;
  defaultNetwork: VirtualNetworkView;
  defaultFirewallPolicy: FirewallPolicyView;
}> {
  const input = createResourceGroupSchema.parse(rawInput);
  const auditIp = resolveAuditIp(context.ip);

  try {
    await dependencies.assertInstanceTenantAccess({
      tenantId: input.tenantId,
      userId: context.userId,
      minimumRole: TenantRole.ADMIN,
    });

    if (!findRegionByCode(input.regionCode)) {
      throw new InstanceWizardError("REGION_NOT_FOUND", "Region not found");
    }

    const created = await dependencies.createResourceGroup({
      tenantId: input.tenantId,
      createdByUserId: context.userId,
      name: input.name,
      slug: input.slug,
      regionCode: input.regionCode,
      defaultNetworkCidr: buildDefaultNetworkCidr(input.tenantId, input.slug),
    });

    await dependencies.logAudit("resource_group_created", auditIp, context.userId, {
      targetId: created.resourceGroup.id,
      tenantId: input.tenantId,
      result: "SUCCESS",
      reason: "RESOURCE_GROUP_CREATED",
      resourceGroupId: created.resourceGroup.id,
      regionCode: input.regionCode,
    }, input.tenantId);

    return created;
  } catch (error) {
    await dependencies.logAudit("resource_group_create_failed", auditIp, context.userId, {
      tenantId: input.tenantId,
      result: "FAILURE",
      reason: error instanceof Error ? error.message : "RESOURCE_GROUP_CREATE_FAILED",
    }, input.tenantId);

    if (error instanceof InstanceWizardError) {
      throw error;
    }

    if (error instanceof z.ZodError) {
      throw error;
    }

    throw new InstanceWizardError("RESOURCE_GROUP_CREATE_FAILED", "Resource group create failed");
  }
}

export async function submitInstanceProvisioningFromWizard(
  rawInput: unknown,
  context: { userId: string; ip?: string | null },
  dependencies: WizardDependencies = defaultDependencies,
): Promise<{ job: InstanceProvisioningJob; instanceId: string | null; reused: boolean }> {
  const input = parseProvisioningInput(rawInput);
  const auditIp = resolveAuditIp(context.ip);

  try {
    await dependencies.assertInstanceTenantAccess({
      tenantId: input.tenantId,
      userId: context.userId,
      minimumRole: TenantRole.ADMIN,
    });

    const [resourceGroup, network, firewallPolicy] = await Promise.all([
      dependencies.findResourceGroup({
        tenantId: input.tenantId,
        resourceGroupId: input.resourceGroupId,
      }),
      dependencies.findNetwork({
        tenantId: input.tenantId,
        networkId: input.networkId,
      }),
      dependencies.findFirewallPolicy({
        tenantId: input.tenantId,
        firewallPolicyId: input.firewallPolicyId,
      }),
    ]);

    if (!resourceGroup) {
      throw new InstanceWizardError("RESOURCE_GROUP_NOT_FOUND", "Resource group not found");
    }
    if (!network) {
      throw new InstanceWizardError("NETWORK_NOT_FOUND", "Network not found");
    }
    if (!firewallPolicy) {
      throw new InstanceWizardError("FIREWALL_POLICY_NOT_FOUND", "Firewall policy not found");
    }
    if (network.resourceGroupId !== resourceGroup.id) {
      throw new InstanceWizardError("NETWORK_RESOURCE_GROUP_MISMATCH", "Network/resource group mismatch");
    }
    if (firewallPolicy.resourceGroupId !== resourceGroup.id) {
      throw new InstanceWizardError("FIREWALL_RESOURCE_GROUP_MISMATCH", "Firewall policy/resource group mismatch");
    }
    if (resourceGroup.regionCode !== input.regionCode) {
      throw new InstanceWizardError("RESOURCE_GROUP_REGION_MISMATCH", "Region mismatch");
    }

    const plan = findPlanByCode(input.planCode);
    if (!plan) {
      throw new InstanceWizardError("PLAN_NOT_FOUND", "Plan not found");
    }

    const image = findImageByCode(input.imageCode);
    if (!image) {
      throw new InstanceWizardError("IMAGE_NOT_FOUND", "Image not found");
    }

    const region = findRegionByCode(input.regionCode);
    if (!region) {
      throw new InstanceWizardError("REGION_NOT_FOUND", "Region not found");
    }

    if (input.cpuCores < plan.cpuCores || input.memoryMb < plan.memoryMb || input.diskGb < plan.diskGb) {
      throw new InstanceWizardError("PROVISIONING_REQUEST_INVALID", "Requested resources below plan minimum");
    }

    const created = await dependencies.createProvisioningRequest({
      tenantId: input.tenantId,
      requestedByUserId: context.userId,
      resourceGroupId: resourceGroup.id,
      networkId: network.id,
      firewallPolicyId: firewallPolicy.id,
      idempotencyKey: input.idempotencyKey,
      name: input.name,
      planCode: plan.code,
      imageCode: image.code,
      regionCode: region.code,
      cpuCores: input.cpuCores,
      memoryMb: input.memoryMb,
      diskGb: input.diskGb,
      adminUsername: input.adminUsername,
      sshPublicKey: input.sshPublicKey,
    });

    await dependencies.logAudit("instance_wizard_draft_saved", auditIp, context.userId, {
      tenantId: input.tenantId,
      targetId: created.instanceId,
      result: "SUCCESS",
      reason: "INSTANCE_WIZARD_SUBMITTED",
      resourceGroupId: input.resourceGroupId,
      networkId: input.networkId,
      firewallPolicyId: input.firewallPolicyId,
      idempotencyKey: input.idempotencyKey,
      reused: created.reused,
    }, input.tenantId);

    await dependencies.logAudit("instance_provisioning_requested", auditIp, context.userId, {
      tenantId: input.tenantId,
      targetId: created.job.id,
      result: "SUCCESS",
      reason: "INSTANCE_PROVISIONING_REQUESTED",
      resourceGroupId: input.resourceGroupId,
      instanceId: created.instanceId,
      idempotencyKey: input.idempotencyKey,
      reused: created.reused,
    }, input.tenantId);

    return created;
  } catch (error) {
    await dependencies.logAudit("instance_provisioning_request_failed", auditIp, context.userId, {
      tenantId: input.tenantId,
      result: "FAILURE",
      reason: error instanceof Error ? error.message : "INSTANCE_PROVISIONING_REQUEST_FAILED",
      resourceGroupId: input.resourceGroupId,
      idempotencyKey: input.idempotencyKey,
    }, input.tenantId);

    if (error instanceof InstanceWizardError) {
      throw error;
    }

    if (error instanceof z.ZodError) {
      throw error;
    }

    throw new InstanceWizardError("UNKNOWN", "Provisioning request failed");
  }
}

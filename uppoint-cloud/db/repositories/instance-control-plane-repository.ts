import "server-only";

import {
  FirewallRuleAction,
  FirewallRuleDirection,
  FirewallStatus,
  InstancePowerState,
  InstanceProvisioningStatus,
  NetworkStatus,
  Prisma,
  ResourceGroupStatus,
} from "@prisma/client";

import { prisma } from "@/db/client";
import type {
  FirewallPolicyView,
  InstanceLifecycleState,
  InstanceProvisioningJob,
  InstanceProvisioningRequest,
  ResourceGroupView,
  VirtualNetworkView,
} from "@/modules/instances/domain/contracts";

type InstanceRepositoryClient = Prisma.TransactionClient | typeof prisma;

function mapProvisioningState(state: InstanceProvisioningStatus): InstanceLifecycleState {
  switch (state) {
    case InstanceProvisioningStatus.PENDING:
      return "pending";
    case InstanceProvisioningStatus.RUNNING:
      return "running";
    case InstanceProvisioningStatus.FAILED:
      return "failed";
    case InstanceProvisioningStatus.COMPLETED:
      return "completed";
    case InstanceProvisioningStatus.CANCELLED:
      return "cancelled";
  }
}

function mapResourceGroup(model: {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  regionCode: string;
  createdAt: Date;
  updatedAt: Date;
}): ResourceGroupView {
  return {
    id: model.id,
    tenantId: model.tenantId,
    name: model.name,
    slug: model.slug,
    regionCode: model.regionCode,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  };
}

function isJobIdempotencyConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.includes("tenantId") && target.includes("idempotencyKey");
  }

  if (typeof target === "string") {
    return target.includes("tenantId") && target.includes("idempotencyKey");
  }

  return false;
}

function mapVirtualNetwork(model: {
  id: string;
  tenantId: string;
  resourceGroupId: string;
  name: string;
  cidr: string;
  createdAt: Date;
  updatedAt: Date;
}): VirtualNetworkView {
  return {
    id: model.id,
    tenantId: model.tenantId,
    resourceGroupId: model.resourceGroupId,
    name: model.name,
    cidr: model.cidr,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  };
}

function mapFirewallPolicy(model: {
  id: string;
  tenantId: string;
  resourceGroupId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}): FirewallPolicyView {
  return {
    id: model.id,
    tenantId: model.tenantId,
    resourceGroupId: model.resourceGroupId,
    name: model.name,
    description: model.description,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  };
}

export async function listActiveResourceGroupsForTenant(
  input: { tenantId: string; take?: number },
  client: InstanceRepositoryClient = prisma,
): Promise<ResourceGroupView[]> {
  const resourceGroups = await client.resourceGroup.findMany({
    where: {
      tenantId: input.tenantId,
      deletedAt: null,
      status: ResourceGroupStatus.ACTIVE,
    },
    orderBy: { createdAt: "asc" },
    take: input.take ?? 100,
    select: {
      id: true,
      tenantId: true,
      name: true,
      slug: true,
      regionCode: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return resourceGroups.map(mapResourceGroup);
}

export async function listActiveNetworksForTenant(
  input: { tenantId: string; resourceGroupId?: string; take?: number },
  client: InstanceRepositoryClient = prisma,
): Promise<VirtualNetworkView[]> {
  const networks = await client.virtualNetwork.findMany({
    where: {
      tenantId: input.tenantId,
      deletedAt: null,
      status: NetworkStatus.ACTIVE,
      ...(input.resourceGroupId ? { resourceGroupId: input.resourceGroupId } : {}),
      resourceGroup: {
        deletedAt: null,
        status: ResourceGroupStatus.ACTIVE,
      },
    },
    orderBy: { createdAt: "asc" },
    take: input.take ?? 200,
    select: {
      id: true,
      tenantId: true,
      resourceGroupId: true,
      name: true,
      cidr: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return networks.map(mapVirtualNetwork);
}

export async function listActiveFirewallPoliciesForTenant(
  input: { tenantId: string; resourceGroupId?: string; take?: number },
  client: InstanceRepositoryClient = prisma,
): Promise<FirewallPolicyView[]> {
  const policies = await client.firewallPolicy.findMany({
    where: {
      tenantId: input.tenantId,
      deletedAt: null,
      status: FirewallStatus.ACTIVE,
      ...(input.resourceGroupId ? { resourceGroupId: input.resourceGroupId } : {}),
      resourceGroup: {
        deletedAt: null,
        status: ResourceGroupStatus.ACTIVE,
      },
    },
    orderBy: { createdAt: "asc" },
    take: input.take ?? 200,
    select: {
      id: true,
      tenantId: true,
      resourceGroupId: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return policies.map(mapFirewallPolicy);
}

export async function findActiveResourceGroupForTenant(
  input: { tenantId: string; resourceGroupId: string },
  client: InstanceRepositoryClient = prisma,
): Promise<ResourceGroupView | null> {
  const resourceGroup = await client.resourceGroup.findFirst({
    where: {
      id: input.resourceGroupId,
      tenantId: input.tenantId,
      deletedAt: null,
      status: ResourceGroupStatus.ACTIVE,
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
      slug: true,
      regionCode: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return resourceGroup ? mapResourceGroup(resourceGroup) : null;
}

export async function findActiveNetworkForTenant(
  input: { tenantId: string; networkId: string },
  client: InstanceRepositoryClient = prisma,
): Promise<VirtualNetworkView | null> {
  const network = await client.virtualNetwork.findFirst({
    where: {
      id: input.networkId,
      tenantId: input.tenantId,
      deletedAt: null,
      status: NetworkStatus.ACTIVE,
      resourceGroup: {
        deletedAt: null,
        status: ResourceGroupStatus.ACTIVE,
      },
    },
    select: {
      id: true,
      tenantId: true,
      resourceGroupId: true,
      name: true,
      cidr: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return network ? mapVirtualNetwork(network) : null;
}

export async function findActiveFirewallPolicyForTenant(
  input: { tenantId: string; firewallPolicyId: string },
  client: InstanceRepositoryClient = prisma,
): Promise<FirewallPolicyView | null> {
  const policy = await client.firewallPolicy.findFirst({
    where: {
      id: input.firewallPolicyId,
      tenantId: input.tenantId,
      deletedAt: null,
      status: FirewallStatus.ACTIVE,
      resourceGroup: {
        deletedAt: null,
        status: ResourceGroupStatus.ACTIVE,
      },
    },
    select: {
      id: true,
      tenantId: true,
      resourceGroupId: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return policy ? mapFirewallPolicy(policy) : null;
}

export async function createResourceGroupWithDefaults(
  input: {
    tenantId: string;
    createdByUserId: string;
    name: string;
    slug: string;
    regionCode: string;
    defaultNetworkCidr: string;
  },
  client: typeof prisma = prisma,
): Promise<{
  resourceGroup: ResourceGroupView;
  defaultNetwork: VirtualNetworkView;
  defaultFirewallPolicy: FirewallPolicyView;
}> {
  return client.$transaction(async (tx) => {
    const resourceGroup = await tx.resourceGroup.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        slug: input.slug,
        regionCode: input.regionCode,
        createdByUserId: input.createdByUserId,
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        slug: true,
        regionCode: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const defaultNetwork = await tx.virtualNetwork.create({
      data: {
        tenantId: input.tenantId,
        resourceGroupId: resourceGroup.id,
        name: "default-vnet",
        cidr: input.defaultNetworkCidr,
        createdByUserId: input.createdByUserId,
      },
      select: {
        id: true,
        tenantId: true,
        resourceGroupId: true,
        name: true,
        cidr: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const defaultFirewallPolicy = await tx.firewallPolicy.create({
      data: {
        tenantId: input.tenantId,
        resourceGroupId: resourceGroup.id,
        name: "default-fw",
        description: "Default baseline policy created with resource group",
        createdByUserId: input.createdByUserId,
      },
      select: {
        id: true,
        tenantId: true,
        resourceGroupId: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await tx.firewallRule.createMany({
      data: [
        {
          tenantId: input.tenantId,
          firewallPolicyId: defaultFirewallPolicy.id,
          name: "allow-ssh",
          direction: FirewallRuleDirection.INGRESS,
          action: FirewallRuleAction.ALLOW,
          protocol: "tcp",
          portRange: "22",
          sourceCidr: "0.0.0.0/0",
          destinationCidr: null,
          priority: 100,
          createdByUserId: input.createdByUserId,
        },
        {
          tenantId: input.tenantId,
          firewallPolicyId: defaultFirewallPolicy.id,
          name: "allow-egress-all",
          direction: FirewallRuleDirection.EGRESS,
          action: FirewallRuleAction.ALLOW,
          protocol: "any",
          portRange: null,
          sourceCidr: null,
          destinationCidr: "0.0.0.0/0",
          priority: 100,
          createdByUserId: input.createdByUserId,
        },
      ],
    });

    return {
      resourceGroup: mapResourceGroup(resourceGroup),
      defaultNetwork: mapVirtualNetwork(defaultNetwork),
      defaultFirewallPolicy: mapFirewallPolicy(defaultFirewallPolicy),
    };
  });
}

export async function findProvisioningJobByIdempotencyKey(
  input: { tenantId: string; idempotencyKey: string },
  client: InstanceRepositoryClient = prisma,
): Promise<InstanceProvisioningJob | null> {
  const job = await client.instanceProvisioningJob.findUnique({
    where: {
      tenantId_idempotencyKey: {
        tenantId: input.tenantId,
        idempotencyKey: input.idempotencyKey,
      },
    },
    select: {
      id: true,
      tenantId: true,
      resourceGroupId: true,
      instanceId: true,
      requestedByUserId: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      lastErrorCode: true,
    },
  });

  if (!job) {
    return null;
  }

  return {
    id: job.id,
    tenantId: job.tenantId,
    resourceGroupId: job.resourceGroupId,
    instanceId: job.instanceId,
    requestedByUserId: job.requestedByUserId,
    state: mapProvisioningState(job.status),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    lastErrorCode: job.lastErrorCode,
  };
}

export async function createProvisioningRequest(
  input: InstanceProvisioningRequest,
  client: typeof prisma = prisma,
): Promise<{
  job: InstanceProvisioningJob;
  reused: boolean;
  instanceId: string | null;
}> {
  try {
    return await client.$transaction(async (tx) => {
      const existingJob = await findProvisioningJobByIdempotencyKey(
        {
          tenantId: input.tenantId,
          idempotencyKey: input.idempotencyKey,
        },
        tx,
      );

      if (existingJob) {
        return {
          job: existingJob,
          reused: true,
          instanceId: existingJob.instanceId,
        };
      }

      const instance = await tx.cloudInstance.create({
        data: {
          tenantId: input.tenantId,
          resourceGroupId: input.resourceGroupId,
          networkId: input.networkId,
          firewallPolicyId: input.firewallPolicyId,
          name: input.name,
          lifecycleStatus: InstanceProvisioningStatus.PENDING,
          powerState: InstancePowerState.STOPPED,
          planCode: input.planCode,
          imageCode: input.imageCode,
          regionCode: input.regionCode,
          cpuCores: input.cpuCores,
          memoryMb: input.memoryMb,
          diskGb: input.diskGb,
          adminUsername: input.adminUsername,
          sshPublicKey: input.sshPublicKey,
          createdByUserId: input.requestedByUserId,
        },
        select: { id: true },
      });

      const jobRow = await tx.instanceProvisioningJob.create({
        data: {
          tenantId: input.tenantId,
          resourceGroupId: input.resourceGroupId,
          instanceId: instance.id,
          status: InstanceProvisioningStatus.PENDING,
          requestedByUserId: input.requestedByUserId,
          idempotencyKey: input.idempotencyKey,
          requestPayload: {
            planCode: input.planCode,
            imageCode: input.imageCode,
            regionCode: input.regionCode,
            cpuCores: input.cpuCores,
            memoryMb: input.memoryMb,
            diskGb: input.diskGb,
            adminUsername: input.adminUsername,
            hasSshPublicKey: Boolean(input.sshPublicKey),
          },
        },
        select: {
          id: true,
          tenantId: true,
          resourceGroupId: true,
          instanceId: true,
          requestedByUserId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          lastErrorCode: true,
        },
      });

      await tx.instanceProvisioningEvent.create({
        data: {
          tenantId: input.tenantId,
          jobId: jobRow.id,
          instanceId: instance.id,
          eventType: "provisioning_requested",
          payload: {
            requestedByUserId: input.requestedByUserId,
            resourceGroupId: input.resourceGroupId,
          },
        },
      });

      return {
        job: {
          id: jobRow.id,
          tenantId: jobRow.tenantId,
          resourceGroupId: jobRow.resourceGroupId,
          instanceId: jobRow.instanceId,
          requestedByUserId: jobRow.requestedByUserId,
          state: mapProvisioningState(jobRow.status),
          createdAt: jobRow.createdAt,
          updatedAt: jobRow.updatedAt,
          lastErrorCode: jobRow.lastErrorCode,
        },
        reused: false,
        instanceId: instance.id,
      };
    });
  } catch (error) {
    if (isJobIdempotencyConflict(error)) {
      const existingJob = await findProvisioningJobByIdempotencyKey({
        tenantId: input.tenantId,
        idempotencyKey: input.idempotencyKey,
      });
      if (existingJob) {
        return {
          job: existingJob,
          reused: true,
          instanceId: existingJob.instanceId,
        };
      }
    }

    throw error;
  }
}

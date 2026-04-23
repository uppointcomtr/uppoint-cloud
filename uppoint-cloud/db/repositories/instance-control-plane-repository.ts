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
  ClaimedProvisioningJob,
  InstanceProvisioningClaimRequest,
  InstanceProvisioningReportRequest,
  InstanceProvisioningReportResult,
  FirewallPolicyView,
  InstanceRuntimeView,
  InstanceLifecycleState,
  InstanceProvisioningJob,
  InstanceProvisioningRequest,
  ResourceGroupView,
  VirtualNetworkView,
} from "@/types/instance-control-plane";

type InstanceRepositoryClient = Prisma.TransactionClient | typeof prisma;
const MAX_PROVISIONING_BACKOFF_SECONDS = 15 * 60;

export class InstanceProvisioningControlPlaneError extends Error {
  constructor(
    public readonly code:
      | "PROVISIONING_JOB_NOT_FOUND"
      | "PROVISIONING_INSTANCE_NOT_FOUND"
      | "PROVISIONING_LOCK_OWNERSHIP_MISMATCH"
      | "PROVISIONING_REPORT_CONFLICT"
      | "VLAN_ALLOCATION_CONFLICT"
      | "INVALID_NETWORK_PREPARATION_PAYLOAD"
      | "INVALID_PROVISIONING_EVENT"
      | "UNKNOWN",
    message: string,
  ) {
    super(message);
    this.name = "InstanceProvisioningControlPlaneError";
  }
}

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

function mapPowerState(state: InstancePowerState): InstanceRuntimeView["powerState"] {
  switch (state) {
    case InstancePowerState.STOPPED:
      return "stopped";
    case InstancePowerState.STARTING:
      return "starting";
    case InstancePowerState.RUNNING:
      return "running";
    case InstancePowerState.STOPPING:
      return "stopping";
    case InstancePowerState.REBOOTING:
      return "rebooting";
    case InstancePowerState.ERROR:
      return "error";
  }
}

function parseJsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function computeProvisioningRetryDelaySeconds(attemptCount: number): number {
  const exponent = Math.max(0, Math.min(attemptCount, 8));
  return Math.min(MAX_PROVISIONING_BACKOFF_SECONDS, 2 ** exponent);
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

export async function listActiveInstancesForTenant(
  input: { tenantId: string; resourceGroupId?: string; take?: number },
  client: InstanceRepositoryClient = prisma,
): Promise<InstanceRuntimeView[]> {
  const instances = await client.cloudInstance.findMany({
    where: {
      tenantId: input.tenantId,
      deletedAt: null,
      ...(input.resourceGroupId ? { resourceGroupId: input.resourceGroupId } : {}),
      resourceGroup: {
        deletedAt: null,
        status: ResourceGroupStatus.ACTIVE,
      },
      network: {
        deletedAt: null,
        status: NetworkStatus.ACTIVE,
      },
      firewallPolicy: {
        deletedAt: null,
        status: FirewallStatus.ACTIVE,
      },
    },
    orderBy: { createdAt: "desc" },
    take: input.take ?? 100,
    select: {
      id: true,
      tenantId: true,
      resourceGroupId: true,
      name: true,
      powerState: true,
      lifecycleStatus: true,
      providerInstanceRef: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return instances.map((instance) => ({
    instanceId: instance.id,
    tenantId: instance.tenantId,
    resourceGroupId: instance.resourceGroupId,
    name: instance.name,
    powerState: mapPowerState(instance.powerState),
    lifecycleState: mapProvisioningState(instance.lifecycleStatus),
    providerInstanceRef: instance.providerInstanceRef,
    createdAt: instance.createdAt,
    updatedAt: instance.updatedAt,
  }));
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
          priority: 200,
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
      attemptCount: true,
      maxAttempts: true,
      nextAttemptAt: true,
      lockedAt: true,
      lockedBy: true,
      providerRef: true,
      providerMessage: true,
      createdAt: true,
      updatedAt: true,
      lastErrorCode: true,
      lastErrorMessage: true,
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
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    nextAttemptAt: job.nextAttemptAt,
    lockedAt: job.lockedAt,
    lockedBy: job.lockedBy,
    providerRef: job.providerRef,
    providerMessage: job.providerMessage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    lastErrorCode: job.lastErrorCode,
    lastErrorMessage: job.lastErrorMessage,
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
          attemptCount: true,
          maxAttempts: true,
          nextAttemptAt: true,
          lockedAt: true,
          lockedBy: true,
          providerRef: true,
          providerMessage: true,
          createdAt: true,
          updatedAt: true,
          lastErrorCode: true,
          lastErrorMessage: true,
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
          attemptCount: jobRow.attemptCount,
          maxAttempts: jobRow.maxAttempts,
          nextAttemptAt: jobRow.nextAttemptAt,
          lockedAt: jobRow.lockedAt,
          lockedBy: jobRow.lockedBy,
          providerRef: jobRow.providerRef,
          providerMessage: jobRow.providerMessage,
          createdAt: jobRow.createdAt,
          updatedAt: jobRow.updatedAt,
          lastErrorCode: jobRow.lastErrorCode,
          lastErrorMessage: jobRow.lastErrorMessage,
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

function mapReportResultFromJob(model: {
  id: string;
  status: InstanceProvisioningStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  providerRef: string | null;
  providerMessage: string | null;
}): InstanceProvisioningReportResult {
  const state = mapProvisioningState(model.status);
  const terminal = state === "completed" || state === "failed" || state === "cancelled";
  return {
    jobId: model.id,
    state,
    terminal,
    retryScheduled: !terminal && state === "pending",
    attemptCount: model.attemptCount,
    maxAttempts: model.maxAttempts,
    nextAttemptAt: model.nextAttemptAt,
    providerRef: model.providerRef,
    providerMessage: model.providerMessage,
  };
}

async function createOrValidateVlanAllocation(
  input: {
    tx: Prisma.TransactionClient;
    tenantId: string;
    resourceGroupId: string;
    networkId: string;
    vlanTag: number;
    bridgeName: string;
    ovsNetworkName: string;
  },
): Promise<void> {
  const existing = await input.tx.kvmVlanAllocation.findUnique({
    where: {
      networkId: input.networkId,
    },
    select: {
      vlanTag: true,
      bridgeName: true,
      ovsNetworkName: true,
    },
  });

  if (existing) {
    return;
  }

  try {
    await input.tx.kvmVlanAllocation.create({
      data: {
        tenantId: input.tenantId,
        resourceGroupId: input.resourceGroupId,
        networkId: input.networkId,
        vlanTag: input.vlanTag,
        bridgeName: input.bridgeName,
        ovsNetworkName: input.ovsNetworkName,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === "P2002"
    ) {
      throw new InstanceProvisioningControlPlaneError(
        "VLAN_ALLOCATION_CONFLICT",
        "VLAN allocation conflict",
      );
    }
    throw error;
  }
}

export async function claimProvisioningJobs(
  input: InstanceProvisioningClaimRequest,
  client: typeof prisma = prisma,
): Promise<ClaimedProvisioningJob[]> {
  const workerId = input.workerId.trim();
  const batchSize = Math.max(1, Math.min(100, Math.floor(input.batchSize)));
  const lockStaleSeconds = Math.max(30, Math.min(3600, Math.floor(input.lockStaleSeconds)));
  const now = new Date();
  const staleBefore = new Date(now.getTime() - lockStaleSeconds * 1000);

  return client.$transaction(async (tx) => {
    const candidates = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "InstanceProvisioningJob"
      WHERE "status" IN ('PENDING'::"InstanceProvisioningStatus", 'RUNNING'::"InstanceProvisioningStatus")
        AND "nextAttemptAt" <= ${now}
        AND "attemptCount" < "maxAttempts"
        AND ("lockedAt" IS NULL OR "lockedAt" < ${staleBefore})
      ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    `;

    if (candidates.length === 0) {
      return [];
    }

    const candidateIds = candidates
      .map((candidate) => candidate.id)
      .filter((candidateId) => candidateId.length > 0);

    if (candidateIds.length === 0) {
      return [];
    }

    await tx.$executeRaw`
      UPDATE "InstanceProvisioningJob"
      SET
        "status" = 'RUNNING'::"InstanceProvisioningStatus",
        "lockedAt" = ${now},
        "lockedBy" = ${workerId},
        "startedAt" = COALESCE("startedAt", ${now}),
        "attemptCount" = "attemptCount" + 1,
        "updatedAt" = ${now}
      WHERE "id" IN (${Prisma.join(candidateIds)})
    `;

    const claimedRows = await tx.instanceProvisioningJob.findMany({
      where: {
        id: {
          in: candidateIds,
        },
      },
      select: {
        id: true,
        tenantId: true,
        resourceGroupId: true,
        requestedByUserId: true,
        attemptCount: true,
        maxAttempts: true,
        requestPayload: true,
        providerRef: true,
        providerMessage: true,
        instance: {
          select: {
            id: true,
            name: true,
            planCode: true,
            imageCode: true,
            regionCode: true,
            cpuCores: true,
            memoryMb: true,
            diskGb: true,
            adminUsername: true,
            sshPublicKey: true,
            providerInstanceRef: true,
            network: {
              select: {
                id: true,
                name: true,
                cidr: true,
              },
            },
          },
        },
      },
      orderBy: [
        { nextAttemptAt: "asc" },
        { createdAt: "asc" },
      ],
    });

    const claimableRows = claimedRows.filter((row) => row.instance && row.instance.network);
    if (claimableRows.length !== claimedRows.length) {
      const invalidRows = claimedRows.filter((row) => !row.instance || !row.instance.network);
      const invalidRowIds = invalidRows.map((row) => row.id);

      if (invalidRowIds.length > 0) {
        await tx.instanceProvisioningJob.updateMany({
          where: {
            id: {
              in: invalidRowIds,
            },
            lockedBy: workerId,
          },
          data: {
            status: InstanceProvisioningStatus.FAILED,
            failedAt: now,
            lockedAt: null,
            lockedBy: null,
            lastErrorCode: "PROVISIONING_INSTANCE_NOT_FOUND",
            lastErrorMessage: "Provisioning instance or network relation missing",
            nextAttemptAt: now,
          },
        });

        await tx.instanceProvisioningEvent.createMany({
          data: invalidRows.map((row) => ({
            tenantId: row.tenantId,
            jobId: row.id,
            instanceId: null,
            eventType: "provisioning_failed",
            payload: {
              workerId,
              reason: "PROVISIONING_INSTANCE_NOT_FOUND",
              terminal: true,
            },
          })),
        });
      }
    }

    await tx.instanceProvisioningEvent.createMany({
      data: claimableRows.map((row) => ({
        tenantId: row.tenantId,
        jobId: row.id,
        instanceId: row.instance?.id ?? null,
        eventType: "provisioning_started",
        payload: {
          workerId,
          attemptCount: row.attemptCount,
          maxAttempts: row.maxAttempts,
        },
      })),
    });

    return claimableRows.map((row) => {
      if (!row.instance || !row.instance.network) {
        throw new InstanceProvisioningControlPlaneError(
          "PROVISIONING_INSTANCE_NOT_FOUND",
          "Provisioning instance or network relation missing",
        );
      }

      return {
        jobId: row.id,
        tenantId: row.tenantId,
        resourceGroupId: row.resourceGroupId,
        requestedByUserId: row.requestedByUserId,
        attemptCount: row.attemptCount,
        maxAttempts: row.maxAttempts,
        requestPayload: parseJsonObject(row.requestPayload),
        providerRef: row.providerRef,
        providerMessage: row.providerMessage,
        network: {
          networkId: row.instance.network.id,
          name: row.instance.network.name,
          cidr: row.instance.network.cidr,
        },
        instance: {
          instanceId: row.instance.id,
          name: row.instance.name,
          planCode: row.instance.planCode,
          imageCode: row.instance.imageCode,
          regionCode: row.instance.regionCode,
          cpuCores: row.instance.cpuCores,
          memoryMb: row.instance.memoryMb,
          diskGb: row.instance.diskGb,
          adminUsername: row.instance.adminUsername,
          sshPublicKey: row.instance.sshPublicKey,
          providerInstanceRef: row.instance.providerInstanceRef,
        },
      };
    });
  });
}

export async function reportProvisioningJob(
  input: InstanceProvisioningReportRequest,
  client: typeof prisma = prisma,
): Promise<InstanceProvisioningReportResult> {
  const workerId = input.workerId.trim();
  const now = new Date();

  return client.$transaction(async (tx) => {
    const job = await tx.instanceProvisioningJob.findUnique({
      where: { id: input.jobId },
      select: {
        id: true,
        tenantId: true,
        resourceGroupId: true,
        instanceId: true,
        status: true,
        attemptCount: true,
        maxAttempts: true,
        nextAttemptAt: true,
        lockedBy: true,
        providerRef: true,
        providerMessage: true,
        instance: {
          select: {
            id: true,
            tenantId: true,
            resourceGroupId: true,
            networkId: true,
          },
        },
      },
    });

    if (!job) {
      throw new InstanceProvisioningControlPlaneError(
        "PROVISIONING_JOB_NOT_FOUND",
        "Provisioning job not found",
      );
    }

    if (
      input.eventType === "provisioning_completed"
      && job.status === InstanceProvisioningStatus.COMPLETED
    ) {
      return mapReportResultFromJob(job);
    }

    if (
      input.eventType === "provisioning_failed"
      && job.status === InstanceProvisioningStatus.FAILED
    ) {
      return mapReportResultFromJob(job);
    }

    if (job.lockedBy !== workerId) {
      throw new InstanceProvisioningControlPlaneError(
        "PROVISIONING_LOCK_OWNERSHIP_MISMATCH",
        "Provisioning report lock ownership mismatch",
      );
    }

    if (!job.instance) {
      throw new InstanceProvisioningControlPlaneError(
        "PROVISIONING_INSTANCE_NOT_FOUND",
        "Provisioning instance not found",
      );
    }

    const resolvedProviderRef = input.providerRef ?? job.providerRef ?? null;
    const resolvedProviderMessage = input.providerMessage ?? job.providerMessage ?? null;
    const metadataPayload = parseJsonObject((input.metadata ?? {}) as Prisma.JsonValue);

    if (input.eventType === "network_prepared") {
      const networkPreparation = input.networkPreparation;
      if (
        !networkPreparation
        || !Number.isInteger(networkPreparation.vlanTag)
        || networkPreparation.vlanTag < 2
        || networkPreparation.vlanTag > 4094
        || networkPreparation.bridgeName.trim().length === 0
        || networkPreparation.ovsNetworkName.trim().length === 0
      ) {
        throw new InstanceProvisioningControlPlaneError(
          "INVALID_NETWORK_PREPARATION_PAYLOAD",
          "Invalid network preparation payload",
        );
      }

      await createOrValidateVlanAllocation({
        tx,
        tenantId: job.instance.tenantId,
        resourceGroupId: job.instance.resourceGroupId,
        networkId: job.instance.networkId,
        vlanTag: networkPreparation.vlanTag,
        bridgeName: networkPreparation.bridgeName.trim(),
        ovsNetworkName: networkPreparation.ovsNetworkName.trim(),
      });

      const updated = await tx.instanceProvisioningJob.updateMany({
        where: {
          id: input.jobId,
          lockedBy: workerId,
        },
        data: {
          status: InstanceProvisioningStatus.RUNNING,
          providerRef: resolvedProviderRef,
          providerMessage: resolvedProviderMessage,
          updatedAt: now,
        },
      });

      if (updated.count !== 1) {
        throw new InstanceProvisioningControlPlaneError(
          "PROVISIONING_REPORT_CONFLICT",
          "Provisioning report conflict",
        );
      }

      await tx.cloudInstance.update({
        where: {
          id: job.instance.id,
        },
        data: {
          lifecycleStatus: InstanceProvisioningStatus.RUNNING,
          providerInstanceRef: resolvedProviderRef,
        },
      });

      await tx.instanceProvisioningEvent.create({
        data: {
          tenantId: job.tenantId,
          jobId: job.id,
          instanceId: job.instance.id,
          eventType: "network_prepared",
          payload: {
            workerId,
            vlanTag: networkPreparation.vlanTag,
            bridgeName: networkPreparation.bridgeName.trim(),
            ovsNetworkName: networkPreparation.ovsNetworkName.trim(),
            ...metadataPayload,
          },
        },
      });
    } else if (input.eventType === "instance_created") {
      const updated = await tx.instanceProvisioningJob.updateMany({
        where: {
          id: input.jobId,
          lockedBy: workerId,
        },
        data: {
          status: InstanceProvisioningStatus.RUNNING,
          providerRef: resolvedProviderRef,
          providerMessage: resolvedProviderMessage,
          updatedAt: now,
        },
      });

      if (updated.count !== 1) {
        throw new InstanceProvisioningControlPlaneError(
          "PROVISIONING_REPORT_CONFLICT",
          "Provisioning report conflict",
        );
      }

      await tx.cloudInstance.update({
        where: {
          id: job.instance.id,
        },
        data: {
          lifecycleStatus: InstanceProvisioningStatus.RUNNING,
          providerInstanceRef: resolvedProviderRef,
        },
      });

      await tx.instanceProvisioningEvent.create({
        data: {
          tenantId: job.tenantId,
          jobId: job.id,
          instanceId: job.instance.id,
          eventType: "instance_created",
          payload: {
            workerId,
            providerRef: resolvedProviderRef,
            providerMessage: resolvedProviderMessage,
            ...metadataPayload,
          },
        },
      });
    } else if (input.eventType === "provisioning_completed") {
      const updated = await tx.instanceProvisioningJob.updateMany({
        where: {
          id: input.jobId,
          lockedBy: workerId,
        },
        data: {
          status: InstanceProvisioningStatus.COMPLETED,
          completedAt: now,
          failedAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          providerRef: resolvedProviderRef,
          providerMessage: resolvedProviderMessage,
          lockedAt: null,
          lockedBy: null,
          nextAttemptAt: now,
          updatedAt: now,
        },
      });

      if (updated.count !== 1) {
        throw new InstanceProvisioningControlPlaneError(
          "PROVISIONING_REPORT_CONFLICT",
          "Provisioning report conflict",
        );
      }

      await tx.cloudInstance.update({
        where: {
          id: job.instance.id,
        },
        data: {
          lifecycleStatus: InstanceProvisioningStatus.COMPLETED,
          powerState: InstancePowerState.RUNNING,
          providerInstanceRef: resolvedProviderRef,
        },
      });

      await tx.instanceProvisioningEvent.create({
        data: {
          tenantId: job.tenantId,
          jobId: job.id,
          instanceId: job.instance.id,
          eventType: "provisioning_completed",
          payload: {
            workerId,
            providerRef: resolvedProviderRef,
            providerMessage: resolvedProviderMessage,
            ...metadataPayload,
          },
        },
      });
    } else if (input.eventType === "provisioning_failed") {
      const terminal = job.attemptCount >= job.maxAttempts;
      const errorCode = input.errorCode?.trim() || "PROVISIONING_FAILED";
      const errorMessage = input.errorMessage?.trim() || input.providerMessage?.trim() || "Provisioning failed";
      const retryDelaySeconds = computeProvisioningRetryDelaySeconds(job.attemptCount);
      const nextAttemptAt = terminal
        ? now
        : new Date(now.getTime() + retryDelaySeconds * 1000);

      const updated = await tx.instanceProvisioningJob.updateMany({
        where: {
          id: input.jobId,
          lockedBy: workerId,
        },
        data: {
          status: terminal ? InstanceProvisioningStatus.FAILED : InstanceProvisioningStatus.PENDING,
          failedAt: terminal ? now : null,
          completedAt: null,
          nextAttemptAt,
          lastErrorCode: errorCode,
          lastErrorMessage: errorMessage,
          providerRef: resolvedProviderRef,
          providerMessage: errorMessage,
          lockedAt: null,
          lockedBy: null,
          updatedAt: now,
        },
      });

      if (updated.count !== 1) {
        throw new InstanceProvisioningControlPlaneError(
          "PROVISIONING_REPORT_CONFLICT",
          "Provisioning report conflict",
        );
      }

      await tx.cloudInstance.update({
        where: {
          id: job.instance.id,
        },
        data: {
          lifecycleStatus: terminal
            ? InstanceProvisioningStatus.FAILED
            : InstanceProvisioningStatus.PENDING,
          powerState: terminal ? InstancePowerState.ERROR : InstancePowerState.STOPPED,
          providerInstanceRef: resolvedProviderRef,
        },
      });

      await tx.instanceProvisioningEvent.create({
        data: {
          tenantId: job.tenantId,
          jobId: job.id,
          instanceId: job.instance.id,
          eventType: "provisioning_failed",
          payload: {
            workerId,
            terminal,
            errorCode,
            errorMessage,
            nextAttemptAt: nextAttemptAt.toISOString(),
            ...metadataPayload,
          },
        },
      });
    } else {
      throw new InstanceProvisioningControlPlaneError(
        "INVALID_PROVISIONING_EVENT",
        "Invalid provisioning event type",
      );
    }

    const refreshedJob = await tx.instanceProvisioningJob.findUnique({
      where: { id: input.jobId },
      select: {
        id: true,
        status: true,
        attemptCount: true,
        maxAttempts: true,
        nextAttemptAt: true,
        providerRef: true,
        providerMessage: true,
      },
    });

    if (!refreshedJob) {
      throw new InstanceProvisioningControlPlaneError(
        "PROVISIONING_JOB_NOT_FOUND",
        "Provisioning job not found after report update",
      );
    }

    const mapped = mapReportResultFromJob(refreshedJob);
    return {
      ...mapped,
      retryScheduled:
        input.eventType === "provisioning_failed"
        ? !mapped.terminal
        : false,
    };
  });
}

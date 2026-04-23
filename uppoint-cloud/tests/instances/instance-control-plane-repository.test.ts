import { InstanceProvisioningStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

vi.mock("@/db/client", () => prismaMock);

import {
  claimProvisioningJobs,
  reportProvisioningJob,
  InstanceProvisioningControlPlaneError,
} from "@/db/repositories/instance-control-plane-repository";

describe("instance control-plane repository", () => {
  it("claims due jobs atomically and returns worker payload", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "job_1" }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
      instanceProvisioningJob: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "job_1",
            tenantId: "tenant_1",
            resourceGroupId: "rg_1",
            requestedByUserId: "user_1",
            attemptCount: 1,
            maxAttempts: 5,
            requestPayload: {},
            providerRef: null,
            providerMessage: null,
            instance: {
              id: "instance_1",
              name: "vm-one",
              planCode: "vm-basic-1",
              imageCode: "ubuntu-24-04-lts",
              regionCode: "tr-ist-1",
              cpuCores: 2,
              memoryMb: 4096,
              diskGb: 60,
              adminUsername: "cloudadmin",
              sshPublicKey: null,
              providerInstanceRef: null,
              network: {
                id: "net_1",
                name: "default-vnet",
                cidr: "10.10.10.0/24",
              },
            },
          },
        ]),
        updateMany: vi.fn(),
      },
      instanceProvisioningEvent: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    prismaMock.prisma.$transaction.mockImplementationOnce(async (callback: (txClient: typeof tx) => unknown) => callback(tx));

    const jobs = await claimProvisioningJobs({
      workerId: "incus-worker-1",
      batchSize: 1,
      lockStaleSeconds: 180,
    }, prismaMock.prisma as never);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.jobId).toBe("job_1");
    expect(tx.instanceProvisioningEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ eventType: "provisioning_started" }),
        ]),
      }),
    );
  });

  it("schedules retry on non-terminal provisioning failure", async () => {
    const now = new Date("2026-04-23T10:00:00.000Z");
    const tx = {
      instanceProvisioningJob: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: "job_1",
            tenantId: "tenant_1",
            resourceGroupId: "rg_1",
            instanceId: "instance_1",
            status: InstanceProvisioningStatus.RUNNING,
            attemptCount: 1,
            maxAttempts: 5,
            nextAttemptAt: now,
            lockedBy: "incus-worker-1",
            providerRef: null,
            providerMessage: null,
            instance: {
              id: "instance_1",
              tenantId: "tenant_1",
              resourceGroupId: "rg_1",
              networkId: "net_1",
            },
          })
          .mockResolvedValueOnce({
            id: "job_1",
            status: InstanceProvisioningStatus.PENDING,
            attemptCount: 1,
            maxAttempts: 5,
            nextAttemptAt: new Date("2026-04-23T10:00:02.000Z"),
            providerRef: null,
            providerMessage: "provisioning failed",
          }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      cloudInstance: {
        update: vi.fn().mockResolvedValue(undefined),
      },
      instanceProvisioningEvent: {
        create: vi.fn().mockResolvedValue(undefined),
      },
      kvmVlanAllocation: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    };

    prismaMock.prisma.$transaction.mockImplementationOnce(async (callback: (txClient: typeof tx) => unknown) => callback(tx));

    const result = await reportProvisioningJob({
      workerId: "incus-worker-1",
      jobId: "job_1",
      eventType: "provisioning_failed",
      errorCode: "INCUS_FAILED",
      errorMessage: "provisioning failed",
      metadata: {},
    }, prismaMock.prisma as never);

    expect(result.state).toBe("pending");
    expect(result.terminal).toBe(false);
    expect(result.retryScheduled).toBe(true);
    expect(tx.instanceProvisioningJob.updateMany).toHaveBeenCalled();
  });

  it("fails closed when report lock owner mismatches", async () => {
    const tx = {
      instanceProvisioningJob: {
        findUnique: vi.fn().mockResolvedValue({
          id: "job_1",
          tenantId: "tenant_1",
          resourceGroupId: "rg_1",
          instanceId: "instance_1",
          status: InstanceProvisioningStatus.RUNNING,
          attemptCount: 1,
          maxAttempts: 5,
          nextAttemptAt: new Date("2026-04-23T10:00:00.000Z"),
          lockedBy: "another-worker",
          providerRef: null,
          providerMessage: null,
          instance: {
            id: "instance_1",
            tenantId: "tenant_1",
            resourceGroupId: "rg_1",
            networkId: "net_1",
          },
        }),
        updateMany: vi.fn(),
      },
      cloudInstance: {
        update: vi.fn(),
      },
      instanceProvisioningEvent: {
        create: vi.fn(),
      },
      kvmVlanAllocation: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    };

    prismaMock.prisma.$transaction.mockImplementationOnce(async (callback: (txClient: typeof tx) => unknown) => callback(tx));

    await expect(
      reportProvisioningJob({
        workerId: "incus-worker-1",
        jobId: "job_1",
        eventType: "instance_created",
        metadata: {},
      }, prismaMock.prisma as never),
    ).rejects.toMatchObject({
      code: "PROVISIONING_LOCK_OWNERSHIP_MISMATCH",
    } satisfies Partial<InstanceProvisioningControlPlaneError>);
  });
});

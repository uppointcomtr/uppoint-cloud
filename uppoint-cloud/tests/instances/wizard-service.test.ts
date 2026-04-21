import { TenantRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  createResourceGroupFromWizard,
  getInstanceWizardBootstrap,
  submitInstanceProvisioningFromWizard,
} from "@/modules/instances/server/wizard-service";

function createWizardDependencies() {
  return {
    resolveTenantContext: vi.fn().mockResolvedValue({
      tenantId: "tenant_1",
      role: TenantRole.ADMIN,
    }),
    assertInstanceTenantAccess: vi.fn().mockResolvedValue({
      tenantId: "tenant_1",
      userId: "user_1",
      role: TenantRole.ADMIN,
    }),
    listTenantOptions: vi.fn().mockResolvedValue([
      {
        tenantId: "tenant_1",
        tenantName: "Tenant One",
        role: TenantRole.ADMIN,
      },
      {
        tenantId: "tenant_2",
        tenantName: "Tenant Two",
        role: TenantRole.MEMBER,
      },
    ]),
    listResourceGroups: vi.fn().mockResolvedValue([
      {
        id: "rg_1",
        tenantId: "tenant_1",
        name: "RG One",
        slug: "rg-one",
        regionCode: "tr-ist-1",
        createdAt: new Date("2026-04-13T10:00:00.000Z"),
        updatedAt: new Date("2026-04-13T10:00:00.000Z"),
      },
    ]),
    listNetworks: vi.fn().mockResolvedValue([
      {
        id: "net_1",
        tenantId: "tenant_1",
        resourceGroupId: "rg_1",
        name: "default-vnet",
        cidr: "10.10.10.0/24",
        createdAt: new Date("2026-04-13T10:00:00.000Z"),
        updatedAt: new Date("2026-04-13T10:00:00.000Z"),
      },
    ]),
    listFirewallPolicies: vi.fn().mockResolvedValue([
      {
        id: "fw_1",
        tenantId: "tenant_1",
        resourceGroupId: "rg_1",
        name: "default-fw",
        description: null,
        createdAt: new Date("2026-04-13T10:00:00.000Z"),
        updatedAt: new Date("2026-04-13T10:00:00.000Z"),
      },
    ]),
    findResourceGroup: vi.fn().mockResolvedValue({
      id: "rg_1",
      tenantId: "tenant_1",
      name: "RG One",
      slug: "rg-one",
      regionCode: "tr-ist-1",
      createdAt: new Date("2026-04-13T10:00:00.000Z"),
      updatedAt: new Date("2026-04-13T10:00:00.000Z"),
    }),
    findNetwork: vi.fn().mockResolvedValue({
      id: "net_1",
      tenantId: "tenant_1",
      resourceGroupId: "rg_1",
      name: "default-vnet",
      cidr: "10.10.10.0/24",
      createdAt: new Date("2026-04-13T10:00:00.000Z"),
      updatedAt: new Date("2026-04-13T10:00:00.000Z"),
    }),
    findFirewallPolicy: vi.fn().mockResolvedValue({
      id: "fw_1",
      tenantId: "tenant_1",
      resourceGroupId: "rg_1",
      name: "default-fw",
      description: null,
      createdAt: new Date("2026-04-13T10:00:00.000Z"),
      updatedAt: new Date("2026-04-13T10:00:00.000Z"),
    }),
    createResourceGroup: vi.fn().mockResolvedValue({
      resourceGroup: {
        id: "rg_2",
        tenantId: "tenant_1",
        name: "RG Two",
        slug: "rg-two",
        regionCode: "tr-ist-2",
        createdAt: new Date("2026-04-13T10:00:00.000Z"),
        updatedAt: new Date("2026-04-13T10:00:00.000Z"),
      },
      defaultNetwork: {
        id: "net_2",
        tenantId: "tenant_1",
        resourceGroupId: "rg_2",
        name: "default-vnet",
        cidr: "10.20.20.0/24",
        createdAt: new Date("2026-04-13T10:00:00.000Z"),
        updatedAt: new Date("2026-04-13T10:00:00.000Z"),
      },
      defaultFirewallPolicy: {
        id: "fw_2",
        tenantId: "tenant_1",
        resourceGroupId: "rg_2",
        name: "default-fw",
        description: null,
        createdAt: new Date("2026-04-13T10:00:00.000Z"),
        updatedAt: new Date("2026-04-13T10:00:00.000Z"),
      },
    }),
    createProvisioningRequest: vi.fn().mockResolvedValue({
      job: {
        id: "job_1",
        tenantId: "tenant_1",
        resourceGroupId: "rg_1",
        instanceId: "instance_1",
        requestedByUserId: "user_1",
        state: "pending" as const,
        createdAt: new Date("2026-04-13T10:00:00.000Z"),
        updatedAt: new Date("2026-04-13T10:00:00.000Z"),
      },
      instanceId: "instance_1",
      reused: false,
    }),
    logAudit: vi.fn().mockResolvedValue(undefined),
  };
}

describe("getInstanceWizardBootstrap", () => {
  it("returns tenant-scoped bootstrap payload with selected tenant marker", async () => {
    const dependencies = createWizardDependencies();

    const result = await getInstanceWizardBootstrap(
      { userId: "user_1", tenantId: "tenant_1" },
      dependencies,
    );

    expect(result.selectedTenantId).toBe("tenant_1");
    expect(result.tenantOptions).toEqual([
      expect.objectContaining({ tenantId: "tenant_1", isSelected: true }),
      expect.objectContaining({ tenantId: "tenant_2", isSelected: false }),
    ]);
    expect(dependencies.listResourceGroups).toHaveBeenCalledWith({
      tenantId: "tenant_1",
      take: 100,
    });
  });
});

describe("createResourceGroupFromWizard", () => {
  it("fails when region code is unknown", async () => {
    const dependencies = createWizardDependencies();

    await expect(
      createResourceGroupFromWizard(
        {
          tenantId: "tenant_1",
          name: "RG Three",
          slug: "rg-three",
          regionCode: "invalid-region",
        },
        { userId: "user_1", ip: "127.0.0.1" },
        dependencies,
      ),
    ).rejects.toMatchObject({
      code: "REGION_NOT_FOUND",
    });

    expect(dependencies.createResourceGroup).not.toHaveBeenCalled();
    expect(dependencies.logAudit).toHaveBeenCalledWith(
      "resource_group_create_failed",
      "127.0.0.1",
      "user_1",
      expect.objectContaining({
        tenantId: "tenant_1",
        result: "FAILURE",
      }),
      "tenant_1",
    );
  });
});

describe("submitInstanceProvisioningFromWizard", () => {
  it("fails closed when network does not belong to selected resource group", async () => {
    const dependencies = createWizardDependencies();
    dependencies.findNetwork.mockResolvedValueOnce({
      id: "net_other",
      tenantId: "tenant_1",
      resourceGroupId: "rg_other",
      name: "wrong-net",
      cidr: "10.99.99.0/24",
      createdAt: new Date("2026-04-13T10:00:00.000Z"),
      updatedAt: new Date("2026-04-13T10:00:00.000Z"),
    });

    await expect(
      submitInstanceProvisioningFromWizard(
        {
          tenantId: "tenant_1",
          resourceGroupId: "rg_1",
          networkId: "net_other",
          firewallPolicyId: "fw_1",
          idempotencyKey: "4e1e3cff-89fc-4feb-bcc8-2558f1174f2a",
          name: "vm-one",
          planCode: "vm-basic-1",
          imageCode: "ubuntu-24-04-lts",
          regionCode: "tr-ist-1",
          cpuCores: 1,
          memoryMb: 2048,
          diskGb: 40,
          adminUsername: "cloudadmin",
        },
        { userId: "user_1", ip: "127.0.0.1" },
        dependencies,
      ),
    ).rejects.toMatchObject({
      code: "NETWORK_RESOURCE_GROUP_MISMATCH",
    });

    expect(dependencies.createProvisioningRequest).not.toHaveBeenCalled();
    expect(dependencies.logAudit).toHaveBeenCalledWith(
      "instance_provisioning_request_failed",
      "127.0.0.1",
      "user_1",
      expect.objectContaining({
        tenantId: "tenant_1",
        result: "FAILURE",
      }),
      "tenant_1",
    );
  });

  it("submits provisioning request and logs success audit actions", async () => {
    const dependencies = createWizardDependencies();

    const result = await submitInstanceProvisioningFromWizard(
      {
        tenantId: "tenant_1",
        resourceGroupId: "rg_1",
        networkId: "net_1",
        firewallPolicyId: "fw_1",
        idempotencyKey: "7b418918-a113-4773-9680-6a0d6617f112",
        name: "vm-one",
        planCode: "vm-basic-1",
        imageCode: "ubuntu-24-04-lts",
        regionCode: "tr-ist-1",
        cpuCores: 1,
        memoryMb: 2048,
        diskGb: 40,
        adminUsername: "cloudadmin",
        sshPublicKey: "",
      },
      { userId: "user_1", ip: "127.0.0.1" },
      dependencies,
    );

    expect(result).toEqual({
      job: expect.objectContaining({ id: "job_1" }),
      instanceId: "instance_1",
      reused: false,
    });
    expect(dependencies.createProvisioningRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant_1",
        resourceGroupId: "rg_1",
        networkId: "net_1",
        firewallPolicyId: "fw_1",
      }),
    );
    expect(dependencies.logAudit).toHaveBeenCalledWith(
      "instance_wizard_draft_saved",
      "127.0.0.1",
      "user_1",
      expect.objectContaining({
        tenantId: "tenant_1",
        result: "SUCCESS",
      }),
      "tenant_1",
    );
    expect(dependencies.logAudit).toHaveBeenCalledWith(
      "instance_provisioning_requested",
      "127.0.0.1",
      "user_1",
      expect.objectContaining({
        tenantId: "tenant_1",
        result: "SUCCESS",
      }),
      "tenant_1",
    );
  });
});

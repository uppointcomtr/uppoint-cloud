import { describe, expect, it, vi } from "vitest";

import { createResourceGroupWithDefaults } from "@/db/repositories/instance-control-plane-repository";

describe("createResourceGroupWithDefaults", () => {
  it("creates default firewall rules with unique priorities", async () => {
    const tx = {
      resourceGroup: {
        create: vi.fn().mockResolvedValue({
          id: "rg_1",
          tenantId: "tenant_1",
          name: "RG One",
          slug: "rg-one",
          regionCode: "tr-ist-1",
          createdAt: new Date("2026-04-14T00:00:00.000Z"),
          updatedAt: new Date("2026-04-14T00:00:00.000Z"),
        }),
      },
      virtualNetwork: {
        create: vi.fn().mockResolvedValue({
          id: "net_1",
          tenantId: "tenant_1",
          resourceGroupId: "rg_1",
          name: "default-vnet",
          cidr: "10.10.10.0/24",
          createdAt: new Date("2026-04-14T00:00:00.000Z"),
          updatedAt: new Date("2026-04-14T00:00:00.000Z"),
        }),
      },
      firewallPolicy: {
        create: vi.fn().mockResolvedValue({
          id: "fw_1",
          tenantId: "tenant_1",
          resourceGroupId: "rg_1",
          name: "default-fw",
          description: "Default baseline policy created with resource group",
          createdAt: new Date("2026-04-14T00:00:00.000Z"),
          updatedAt: new Date("2026-04-14T00:00:00.000Z"),
        }),
      },
      firewallRule: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };

    const client = {
      $transaction: vi.fn(async (callback: (transactionClient: typeof tx) => Promise<unknown>) => callback(tx)),
    };

    await createResourceGroupWithDefaults(
      {
        tenantId: "tenant_1",
        createdByUserId: "user_1",
        name: "RG One",
        slug: "rg-one",
        regionCode: "tr-ist-1",
        defaultNetworkCidr: "10.10.10.0/24",
      },
      client as never,
    );

    const createManyCall = tx.firewallRule.createMany.mock.calls[0]?.[0];
    const priorities = (createManyCall?.data ?? []).map((entry: { priority: number }) => entry.priority);

    expect(priorities).toEqual([100, 200]);
    expect(new Set(priorities).size).toBe(priorities.length);
  });
});

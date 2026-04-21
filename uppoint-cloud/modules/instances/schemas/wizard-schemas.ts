import { z } from "zod";

export const createResourceGroupSchema = z.object({
  tenantId: z.string().trim().min(1).max(191),
  name: z.string().trim().min(3).max(80),
  slug: z.string().trim().regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/),
  regionCode: z.string().trim().min(3).max(32),
});

export const submitInstanceProvisioningSchema = z.object({
  tenantId: z.string().trim().min(1).max(191),
  resourceGroupId: z.string().trim().min(1).max(191),
  networkId: z.string().trim().min(1).max(191),
  firewallPolicyId: z.string().trim().min(1).max(191),
  idempotencyKey: z.string().trim().uuid(),
  name: z.string().trim().regex(/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/),
  planCode: z.string().trim().min(2).max(64),
  imageCode: z.string().trim().min(2).max(64),
  regionCode: z.string().trim().min(3).max(32),
  cpuCores: z.coerce.number().int().min(1).max(64),
  memoryMb: z.coerce.number().int().min(1024).max(262144),
  diskGb: z.coerce.number().int().min(20).max(4096),
  adminUsername: z.string().trim().regex(/^[a-z_][a-z0-9_-]{1,31}$/),
  sshPublicKey: z.string().trim().max(2048).optional().or(z.literal("")),
});

export type CreateResourceGroupInput = z.infer<typeof createResourceGroupSchema>;
export type SubmitInstanceProvisioningInput = z.infer<typeof submitInstanceProvisioningSchema>;

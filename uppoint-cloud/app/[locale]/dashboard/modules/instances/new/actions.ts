"use server";

import { TenantRole } from "@prisma/client";
import { headers } from "next/headers";
import { z } from "zod";

import { auth } from "@/auth";
import { env } from "@/lib/env";
import { resolveTrustedClientIp } from "@/lib/security/client-ip";
import {
  createResourceGroupFromWizard,
  InstanceWizardError,
  submitInstanceProvisioningFromWizard,
} from "@/modules/instances/server/wizard-service";
import { assertInstanceTenantAccess } from "@/modules/instances/server/security-boundary";
import { resolveUserTenantContext } from "@/modules/tenant/server/user-tenant";

export interface InstanceWizardActionState {
  status: "idle" | "success" | "error";
  code?: string;
  message?: string;
  resourceGroupId?: string;
  jobId?: string;
  instanceId?: string | null;
  reused?: boolean;
}

const tenantGuardSchema = z.object({
  tenantId: z.string().trim().min(1).max(191),
});

const createResourceGroupActionSchema = tenantGuardSchema.extend({
  name: z.string().trim().min(3).max(80),
  slug: z.string().trim().regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/),
  regionCode: z.string().trim().min(3).max(32),
});

const submitProvisioningActionSchema = tenantGuardSchema.extend({
  resourceGroupId: z.string().trim().min(1).max(191),
  networkId: z.string().trim().min(1).max(191),
  firewallPolicyId: z.string().trim().min(1).max(191),
  idempotencyKey: z.string().trim().uuid(),
  name: z.string().trim().regex(/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/),
  planCode: z.string().trim().min(2).max(64),
  imageCode: z.string().trim().min(2).max(64),
  regionCode: z.string().trim().min(3).max(32),
  cpuCores: z.string().trim().min(1),
  memoryMb: z.string().trim().min(1),
  diskGb: z.string().trim().min(1),
  adminUsername: z.string().trim().regex(/^[a-z_][a-z0-9_-]{1,31}$/),
  sshPublicKey: z.string().optional().default(""),
});

function formDataToObject(formData: FormData): Record<string, string> {
  const output: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      output[key] = value;
    }
  }

  return output;
}

async function resolveActionIp(): Promise<string | null> {
  const requestHeaders = await headers();
  const realIp = requestHeaders.get("x-real-ip")?.trim() ?? null;
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  return resolveTrustedClientIp({
    realIpHeader: realIp,
    forwardedForHeader: forwardedFor,
    isProduction: env.NODE_ENV === "production",
  });
}

async function ensureAuthorizedSession(): Promise<{ userId: string; ip: string | null }> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }

  return {
    userId: session.user.id,
    ip: await resolveActionIp(),
  };
}

export async function createResourceGroupWizardAction(
  _previousState: InstanceWizardActionState,
  formData: FormData,
): Promise<InstanceWizardActionState> {
  try {
    const raw = formDataToObject(formData);
    const input = createResourceGroupActionSchema.parse(raw);
    const context = await ensureAuthorizedSession();

    await resolveUserTenantContext({
      userId: context.userId,
      tenantId: input.tenantId,
      minimumRole: TenantRole.ADMIN,
    });

    await assertInstanceTenantAccess({
      tenantId: input.tenantId,
      userId: context.userId,
      minimumRole: TenantRole.ADMIN,
    });

    const created = await createResourceGroupFromWizard(input, {
      userId: context.userId,
      ip: context.ip,
    });

    return {
      status: "success",
      code: "RESOURCE_GROUP_CREATED",
      resourceGroupId: created.resourceGroup.id,
      message: created.resourceGroup.name,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        status: "error",
        code: "VALIDATION_FAILED",
      };
    }

    if (error instanceof InstanceWizardError) {
      return {
        status: "error",
        code: error.code,
      };
    }

    return {
      status: "error",
      code: error instanceof Error ? error.message : "UNKNOWN",
    };
  }
}

export async function submitInstanceProvisioningWizardAction(
  _previousState: InstanceWizardActionState,
  formData: FormData,
): Promise<InstanceWizardActionState> {
  try {
    const raw = formDataToObject(formData);
    const input = submitProvisioningActionSchema.parse(raw);
    const context = await ensureAuthorizedSession();

    await resolveUserTenantContext({
      userId: context.userId,
      tenantId: input.tenantId,
      minimumRole: TenantRole.ADMIN,
    });

    await assertInstanceTenantAccess({
      tenantId: input.tenantId,
      userId: context.userId,
      minimumRole: TenantRole.ADMIN,
    });

    const created = await submitInstanceProvisioningFromWizard(input, {
      userId: context.userId,
      ip: context.ip,
    });

    return {
      status: "success",
      code: "INSTANCE_PROVISIONING_REQUESTED",
      jobId: created.job.id,
      instanceId: created.instanceId,
      reused: created.reused,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        status: "error",
        code: "VALIDATION_FAILED",
      };
    }

    if (error instanceof InstanceWizardError) {
      return {
        status: "error",
        code: error.code,
      };
    }

    return {
      status: "error",
      code: error instanceof Error ? error.message : "UNKNOWN",
    };
  }
}

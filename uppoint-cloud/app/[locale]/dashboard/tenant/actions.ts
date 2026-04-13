"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit-log";
import { env } from "@/lib/env";
import { resolveTrustedClientIp } from "@/lib/security/client-ip";
import {
  createTenantForUser,
  TenantManagementError,
} from "@/modules/tenant/server/tenant-management";

export interface TenantCreateActionState {
  status: "idle" | "success" | "error";
  code?: "VALIDATION_FAILED" | "UNAUTHORIZED" | "TENANT_CREATE_FAILED" | "TENANT_SLUG_RETRY_EXHAUSTED" | "UNKNOWN";
  scopeId?: string;
}

const INITIAL_ERROR_CODE: TenantCreateActionState["code"] = "UNKNOWN";

const createTenantActionSchema = z.object({
  name: z.string().trim().min(3).max(80),
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

async function ensureAuthorizedSession(): Promise<{ userId: string; ip: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }

  return {
    userId: session.user.id,
    ip: (await resolveActionIp()) ?? "unknown",
  };
}

export async function createTenantDashboardAction(
  _previousState: TenantCreateActionState,
  formData: FormData,
): Promise<TenantCreateActionState> {
  let context: { userId: string; ip: string } | null = null;
  const raw = formDataToObject(formData);

  try {
    context = await ensureAuthorizedSession();
    const input = createTenantActionSchema.parse(raw);

    const created = await createTenantForUser({
      userId: context.userId,
      name: input.name,
    });

    await logAudit("tenant_created", context.ip, context.userId, {
      targetId: created.id,
      result: "SUCCESS",
      reason: "TENANT_CREATED",
      tenantSlug: created.slug,
    }, created.id);

    return {
      status: "success",
      scopeId: created.id,
    };
  } catch (error) {
    let code: TenantCreateActionState["code"] = INITIAL_ERROR_CODE;

    if (error instanceof z.ZodError) {
      code = "VALIDATION_FAILED";
    } else if (error instanceof TenantManagementError) {
      code = error.code;
    } else if (error instanceof Error && error.message === "UNAUTHORIZED") {
      code = "UNAUTHORIZED";
    }

    if (context) {
      await logAudit("tenant_create_failed", context.ip, context.userId, {
        result: "FAILURE",
        reason: code,
      });
    }

    return {
      status: "error",
      code,
    };
  }
}

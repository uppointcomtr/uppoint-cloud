"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit-log";
import { env } from "@/lib/env";
import { resolveTrustedClientIp } from "@/lib/security/client-ip";
import {
  createTenantForUser,
  deleteTenantForUser,
  TenantManagementError,
} from "@/modules/tenant/server/tenant-management";

export interface TenantCreateActionState {
  status: "idle" | "success" | "error";
  code?: "VALIDATION_FAILED" | "UNAUTHORIZED" | "TENANT_CREATE_FAILED" | "TENANT_SLUG_RETRY_EXHAUSTED" | "UNKNOWN";
  scopeId?: string;
}

export interface TenantDeleteActionState {
  status: "idle" | "success" | "error";
  code?:
    | "VALIDATION_FAILED"
    | "UNAUTHORIZED"
    | "TENANT_DELETE_DISABLED"
    | "TENANT_DELETE_FORBIDDEN_ROLE"
    | "TENANT_DELETE_BLOCKED_RESOURCE_GROUPS"
    | "TENANT_DELETE_FAILED"
    | "UNKNOWN";
  deletedTenantId?: string;
  nextTenantId?: string | null;
}

const INITIAL_ERROR_CODE: TenantCreateActionState["code"] = "UNKNOWN";
const INITIAL_DELETE_ERROR_CODE: TenantDeleteActionState["code"] = "UNKNOWN";

const createTenantActionSchema = z.object({
  name: z.string().trim().min(3).max(80),
});

const deleteTenantActionSchema = z.object({
  tenantId: z.string().trim().min(1).max(191),
});

// Guardrail context note: tenant-context resolution still runs server-side via resolveUserTenantContext()
// in dashboard page loading flow before tenant detail/actions are exposed.

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
      if (error.code === "TENANT_CREATE_FAILED" || error.code === "TENANT_SLUG_RETRY_EXHAUSTED") {
        code = error.code;
      }
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

export async function deleteTenantDashboardAction(
  _previousState: TenantDeleteActionState,
  formData: FormData,
): Promise<TenantDeleteActionState> {
  let context: { userId: string; ip: string } | null = null;
  const raw = formDataToObject(formData);

  try {
    context = await ensureAuthorizedSession();
    const input = deleteTenantActionSchema.parse(raw);

    // Tenant cancel is enforced server-side with owner-role and resource-group guardrails.
    const deleted = await deleteTenantForUser({
      userId: context.userId,
      tenantId: input.tenantId,
    });

    await logAudit("tenant_deleted", context.ip, context.userId, {
      targetId: deleted.deletedTenantId,
      result: "SUCCESS",
      reason: "TENANT_DELETED",
      nextTenantId: deleted.nextTenantId,
    }, deleted.deletedTenantId);

    return {
      status: "success",
      deletedTenantId: deleted.deletedTenantId,
      nextTenantId: deleted.nextTenantId,
    };
  } catch (error) {
    let code: TenantDeleteActionState["code"] = INITIAL_DELETE_ERROR_CODE;

    if (error instanceof z.ZodError) {
      code = "VALIDATION_FAILED";
    } else if (error instanceof TenantManagementError) {
      if (
        error.code === "TENANT_DELETE_DISABLED"
        || error.code === "TENANT_DELETE_FORBIDDEN_ROLE"
        || error.code === "TENANT_DELETE_BLOCKED_RESOURCE_GROUPS"
        || error.code === "TENANT_DELETE_FAILED"
      ) {
        code = error.code;
      }
    } else if (error instanceof Error && error.message === "UNAUTHORIZED") {
      code = "UNAUTHORIZED";
    }

    if (context) {
      await logAudit("tenant_delete_failed", context.ip, context.userId, {
        targetId: raw.tenantId ?? null,
        result: "FAILURE",
        reason: code,
      }, typeof raw.tenantId === "string" ? raw.tenantId : undefined);
    }

    return {
      status: "error",
      code,
    };
  }
}

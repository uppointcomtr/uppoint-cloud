import "server-only";

import { randomUUID } from "crypto";
import { appendFile, mkdir } from "fs/promises";
import { dirname } from "path";
import type { Prisma } from "@prisma/client";
import { headers } from "next/headers";

import { prisma } from "@/db/client";
import { env } from "@/lib/env";
import { resolveTrustedClientIp } from "@/lib/security/client-ip";

export type AuditAction =
  | "register_success"
  | "register_verified"
  | "register_verification_restarted"
  | "register_verification_failed"
  | "login_success"
  | "login_otp_failed"
  | "login_challenge_start_failed"
  | "logout_success"
  | "rate_limit_exceeded"
  | "password_reset_requested"
  | "password_reset_success"
  | "password_reset_failed"
  | "password_changed"
  | "session_revoked"
  | "email_verified"
  | "email_verification_failed"
  | "edge_host_rejected"
  | "edge_origin_rejected"
  | "internal_dispatch_success"
  | "internal_dispatch_failed"
  | "internal_dispatch_replay_blocked"
  | "tenant_access_denied"
  | "tenant_role_insufficient"
  | "tenant_context_missing"
  | "user_soft_deleted";

const SENSITIVE_KEY_PATTERN = /(password|secret|token|authorization|cookie|email|phone|name|fullName|firstName|lastName|address)/i;
// Match plaintext secrets that may appear as values (bearer tokens, JWT prefix, raw passwords).
const SENSITIVE_VALUE_PATTERN = /(password=|bearer\s|eyj[a-z0-9]|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i;
const SECURITY_SIGNAL_ACTIONS = new Set<AuditAction>([
  "rate_limit_exceeded",
  "login_otp_failed",
  "login_challenge_start_failed",
  "password_reset_failed",
  "session_revoked",
  "edge_host_rejected",
  "edge_origin_rejected",
  "internal_dispatch_failed",
  "internal_dispatch_replay_blocked",
  "tenant_access_denied",
  "tenant_role_insufficient",
]);
const AUDIT_FALLBACK_LOG_PATH = env.AUDIT_FALLBACK_LOG_PATH || "/var/log/uppoint-cloud/audit-fallback.log";

let auditFallbackPathChecked = false;
let auditFallbackPathReady = false;

async function ensureAuditFallbackPath(): Promise<boolean> {
  if (auditFallbackPathChecked) {
    return auditFallbackPathReady;
  }

  auditFallbackPathChecked = true;

  try {
    await mkdir(dirname(AUDIT_FALLBACK_LOG_PATH), { recursive: true });
    auditFallbackPathReady = true;
  } catch {
    auditFallbackPathReady = false;
  }

  return auditFallbackPathReady;
}

async function writeAuditFallbackLine(payload: Record<string, unknown>): Promise<void> {
  if (!(await ensureAuditFallbackPath())) {
    return;
  }

  try {
    await appendFile(
      AUDIT_FALLBACK_LOG_PATH,
      `${JSON.stringify(payload)}\n`,
      { encoding: "utf8" },
    );
  } catch {
    // Do not throw from audit fallback sink.
  }
}

function redactSensitiveMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = "[REDACTED]";
      continue;
    }

    if (typeof value === "string" && SENSITIVE_VALUE_PATTERN.test(value)) {
      output[key] = "[REDACTED]";
      continue;
    }

    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      output[key] = redactSensitiveMetadata(value as Record<string, unknown>);
      continue;
    }

    output[key] = value;
  }

  return output;
}

async function resolveRequestAuditContext(): Promise<Record<string, unknown>> {
  try {
    const headersList = await headers();
    const requestId = headersList.get("x-request-id")?.trim() || randomUUID();
    const userAgent = headersList.get("user-agent");
    const realIp = headersList.get("x-real-ip")?.trim() ?? null;
    const forwardedFor = headersList.get("x-forwarded-for");

    const resolvedIp = resolveTrustedClientIp({
      realIpHeader: realIp,
      forwardedForHeader: forwardedFor,
      isProduction: env.NODE_ENV === "production",
    });

    return {
      requestId,
      userAgent: userAgent ? userAgent.slice(0, 255) : null,
      ip: resolvedIp,
      forwardedFor: forwardedFor ? forwardedFor.slice(0, 255) : null,
    };
  } catch {
    return {
      requestId: randomUUID(),
      userAgent: null,
      ip: null,
      forwardedFor: null,
    };
  }
}

function pickString(input: unknown): string | undefined {
  return typeof input === "string" && input.trim().length > 0 ? input.trim() : undefined;
}

function resolveStoredIp(inputIp: string, requestContextIp: unknown): string | null {
  const explicitIp = pickString(inputIp);
  if (explicitIp && explicitIp !== "unknown") {
    return explicitIp;
  }

  return pickString(requestContextIp) ?? null;
}

function resolveAuditResult(action: AuditAction, metadata?: Record<string, unknown>): string {
  const explicitResult = pickString(metadata?.result);
  if (explicitResult) {
    return explicitResult.toUpperCase();
  }

  const normalizedAction = action.toLowerCase();
  if (normalizedAction.includes("failed") || normalizedAction.includes("exceeded")) {
    return "FAILURE";
  }
  if (normalizedAction.includes("success") || normalizedAction.includes("verified")) {
    return "SUCCESS";
  }
  return "INFO";
}

function emitSecuritySignal(input: {
  action: AuditAction;
  result: string;
  requestId?: string;
  userId?: string;
  targetId?: string;
  reason?: string;
}): void {
  const shouldEmit =
    SECURITY_SIGNAL_ACTIONS.has(input.action)
    || input.result === "FAILURE";

  if (!shouldEmit) {
    return;
  }

  const signal = {
    type: "security_signal",
    action: input.action,
    result: input.result,
    requestId: input.requestId ?? null,
    userId: input.userId ?? null,
    targetId: input.targetId ?? null,
    reason: input.reason ?? null,
    at: new Date().toISOString(),
  };

  console.warn("[security-signal]", JSON.stringify(signal));
}

/**
 * Records a security-relevant event for forensic analysis.
 * Never throws to callers; DB errors are captured via fallback sink.
 */
export async function logAudit(
  action: AuditAction,
  ip: string,
  userId?: string,
  metadata?: Record<string, unknown>,
  tenantId?: string,
): Promise<void> {
  const requestContext = await resolveRequestAuditContext();
  const safeMetadata = metadata ? redactSensitiveMetadata(metadata) : {};
  const result = resolveAuditResult(action, safeMetadata);
  const reason = pickString(safeMetadata.reason);
  const actorId = pickString(safeMetadata.actorId);
  const targetId = pickString(safeMetadata.targetId) ?? pickString(safeMetadata.targetUserId);
  const resolvedTenantId = pickString(tenantId) ?? pickString(safeMetadata.tenantId);
  const requestId = pickString(requestContext.requestId);
  const userAgent = pickString(requestContext.userAgent);
  const forwardedFor = pickString(requestContext.forwardedFor);
  const storedIp = resolveStoredIp(ip, requestContext.ip);

  const composedMetadata = {
    ...safeMetadata,
    request: requestContext,
  };

  try {
    await prisma.auditLog.create({
      data: {
        action,
        ip: storedIp,
        userId: userId ?? undefined,
        actorId,
        targetId,
        tenantId: resolvedTenantId,
        result,
        reason,
        requestId,
        userAgent,
        forwardedFor,
        metadata: composedMetadata as Prisma.InputJsonValue,
      },
    });

    emitSecuritySignal({
      action,
      result,
      requestId,
      userId: userId ?? undefined,
      targetId,
      reason,
    });
  } catch (error) {
    const fallbackPayload = {
      type: "audit_fallback",
      action,
      userId: userId ?? null,
      metadata: metadata ? redactSensitiveMetadata(metadata) : {},
      error: error instanceof Error ? error.message : "unknown",
      at: new Date().toISOString(),
    };
    await writeAuditFallbackLine(fallbackPayload);
    console.error("[audit-fallback]", JSON.stringify(fallbackPayload));
    console.error("[audit] Failed to write audit log:", action, error);
  }
}

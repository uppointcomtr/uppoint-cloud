import "server-only";

import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { headers } from "next/headers";

import { prisma } from "@/db/client";

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
  | "email_verified"
  | "email_verification_failed";

const SENSITIVE_KEY_PATTERN = /(password|secret|token|authorization|cookie)/i;

function redactSensitiveMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = "[REDACTED]";
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
    const forwardedFor = headersList.get("x-forwarded-for");

    return {
      requestId,
      userAgent: userAgent ? userAgent.slice(0, 255) : null,
      forwardedFor: forwardedFor ? forwardedFor.split(",")[0]?.trim() ?? null : null,
    };
  } catch {
    return {
      requestId: randomUUID(),
      userAgent: null,
      forwardedFor: null,
    };
  }
}

/**
 * Records a security-relevant event for forensic analysis.
 * Fire-and-forget: never throws, never blocks the main request.
 */
export function logAudit(
  action: AuditAction,
  ip: string,
  userId?: string,
  metadata?: Record<string, unknown>,
): void {
  void (async () => {
    const requestContext = await resolveRequestAuditContext();
    const safeMetadata = metadata ? redactSensitiveMetadata(metadata) : {};
    const composedMetadata = {
      ...safeMetadata,
      request: requestContext,
    };

    await prisma.auditLog.create({
      data: {
        action,
        ip,
        userId: userId ?? undefined,
        metadata: composedMetadata as Prisma.InputJsonValue,
      },
    });
  })().catch((error) => {
    console.error("[audit] Failed to write audit log:", action, error);
  });
}

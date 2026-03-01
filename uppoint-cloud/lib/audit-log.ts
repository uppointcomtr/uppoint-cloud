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
  | "password_changed"
  | "session_revoked"
  | "email_verified"
  | "email_verification_failed";

const SENSITIVE_KEY_PATTERN = /(password|secret|token|authorization|cookie)/i;
// Match plaintext secrets that may appear as values (bearer tokens, JWT prefix, raw passwords).
const SENSITIVE_VALUE_PATTERN = /(password=|bearer\s|eyj[a-z0-9])/i;

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

function extractRightmostIp(value: string): string | null {
  // Use the rightmost valid IP from X-Forwarded-For: the nearest trusted proxy appends its
  // own remote addr, so the rightmost entry is controlled by our infrastructure, not the client.
  const parts = value
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .reverse();

  for (const part of parts) {
    // Strip IPv4-mapped IPv6 prefix and port suffix before validation
    const stripped = part.replace(/^::ffff:/i, "").replace(/:\d+$/, "");
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(stripped) || /^[0-9a-f:]+$/i.test(stripped)) {
      return stripped;
    }
  }

  return null;
}

async function resolveRequestAuditContext(): Promise<Record<string, unknown>> {
  try {
    const headersList = await headers();
    const requestId = headersList.get("x-request-id")?.trim() || randomUUID();
    const userAgent = headersList.get("user-agent");
    const realIp = headersList.get("x-real-ip")?.trim() ?? null;
    const forwardedFor = headersList.get("x-forwarded-for");

    // Prefer X-Real-IP (set by nginx from $remote_addr); fall back to rightmost XFF.
    const resolvedIp =
      realIp ||
      (forwardedFor ? extractRightmostIp(forwardedFor) : null);

    return {
      requestId,
      userAgent: userAgent ? userAgent.slice(0, 255) : null,
      ip: resolvedIp,
    };
  } catch {
    return {
      requestId: randomUUID(),
      userAgent: null,
      ip: null,
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

import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/db/client";

export type AuditAction =
  | "register_success"
  | "register_verified"
  | "register_verification_restarted"
  | "register_verification_failed"
  | "login_success"
  | "login_otp_failed"
  | "login_challenge_start_failed"
  | "password_reset_success"
  | "password_reset_failed"
  | "email_verified"
  | "email_verification_failed";

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
  prisma.auditLog
    .create({
      data: {
        action,
        ip,
        userId: userId ?? undefined,
        metadata: (metadata as Prisma.InputJsonValue | undefined) ?? undefined,
      },
    })
    .catch((error) => {
      console.error("[audit] Failed to write audit log:", action, error);
    });
}

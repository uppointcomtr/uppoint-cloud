import "server-only";

import { logAudit } from "@/lib/audit-log";

type AuthFailureAuditAction =
  | "register_verification_failed"
  | "login_challenge_start_failed"
  | "login_otp_failed"
  | "password_reset_failed"
  | "account_delete_challenge_failed"
  | "profile_update_failed"
  | "account_contact_change_failed";

interface AuthInvalidBodyAuditInput {
  action: AuthFailureAuditAction;
  ip: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export async function logAuthInvalidBody(input: AuthInvalidBodyAuditInput): Promise<void> {
  await logAudit(input.action, input.ip, input.userId, {
    ...(input.metadata ?? {}),
    reason: "INVALID_BODY",
    result: "FAILURE",
  });
}

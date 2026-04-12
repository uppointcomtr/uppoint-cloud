import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit-log";
import { withIdempotency } from "@/lib/http/idempotency";
import { fail, ok } from "@/lib/http/response";
import { logServerError } from "@/lib/observability/safe-server-error-log";
import { enforceFailClosedIdentifierRateLimit, enforceFailClosedIpRateLimit } from "@/lib/security/route-guard";
import {
  PasswordResetChallengeError,
  verifyPasswordResetSmsCode,
} from "@/modules/auth/server/password-reset-challenge";
import { logAuthInvalidBody } from "@/modules/auth/server/route-audit";

export async function POST(request: Request) {
  return withIdempotency("auth:forgot-password-verify-sms", async () => {
  const ipGuard = await enforceFailClosedIpRateLimit({
    rateLimitAction: "forgot-password-verify-sms",
    rateLimitMax: 10,
    rateLimitWindowSeconds: 900,
    auditActionName: "forgot-password-verify-sms",
    auditScope: "ip",
  });
  if (ipGuard.blockedResponse) {
    return ipGuard.blockedResponse;
  }
  const ip = ipGuard.ip;

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    await logAuthInvalidBody({
      action: "password_reset_failed",
      ip,
      metadata: { step: "verify_sms" },
    });
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  const rawPayload = payload as Record<string, unknown>;
  const challengeId = typeof rawPayload.challengeId === "string" ? rawPayload.challengeId.trim() : "";

  if (challengeId) {
    const identifierRateLimit = await enforceFailClosedIdentifierRateLimit({
      rateLimitAction: "forgot-password-verify-sms-challenge",
      identifier: challengeId,
      rateLimitMax: 8,
      rateLimitWindowSeconds: 900,
      auditActionName: "forgot-password-verify-sms",
      auditScope: "challenge",
      ip,
    });
    if (identifierRateLimit) {
      return identifierRateLimit;
    }
  }

  try {
    const result = await verifyPasswordResetSmsCode(payload);

    await logAudit("password_reset_requested", ip, undefined, {
      step: "verify_sms",
      challengeId,
      result: "SUCCESS",
    });

    return NextResponse.json(
      ok({
        resetToken: result.resetToken,
      }),
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      await logAudit("password_reset_failed", ip, undefined, {
        step: "verify_sms",
        reason: "VALIDATION_FAILED",
      });
      return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
    }

    if (error instanceof PasswordResetChallengeError) {
      const neutralizedChallengeCode =
        error.code === "INVALID_OR_EXPIRED_CHALLENGE" || error.code === "INVALID_SMS_CODE";
      const status =
        neutralizedChallengeCode ||
        error.code === "MAX_ATTEMPTS_REACHED"
          ? 400
          : 500;

      await logAudit("password_reset_failed", ip, undefined, {
        step: "verify_sms",
        reason: neutralizedChallengeCode ? "VERIFICATION_CODE_REJECTED" : error.code,
      });
      return NextResponse.json(
        fail(neutralizedChallengeCode ? "INVALID_OR_EXPIRED_CHALLENGE" : error.code),
        { status },
      );
    }

    await logAudit("password_reset_failed", ip, undefined, {
      step: "verify_sms",
      reason: "FORGOT_PASSWORD_VERIFY_SMS_FAILED",
    });
    logServerError("forgot_password_verify_sms_failed", error, {
      route: "/api/auth/forgot-password/challenge/verify-sms",
      challengeId,
    });
    return NextResponse.json(fail("FORGOT_PASSWORD_VERIFY_SMS_FAILED"), {
      status: 500,
    });
  }
  });
}

export async function GET() {
  return NextResponse.json(
    fail("METHOD_NOT_ALLOWED"),
    {
      status: 405,
      headers: {
        Allow: "POST",
      },
    },
  );
}

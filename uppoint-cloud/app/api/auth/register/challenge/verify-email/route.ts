import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit-log";
import { withIdempotency } from "@/lib/http/idempotency";
import { fail, ok } from "@/lib/http/response";
import { logServerError } from "@/lib/observability/safe-server-error-log";
import { enforceFailClosedIdentifierRateLimit, enforceFailClosedIpRateLimit } from "@/lib/security/route-guard";
import {
  RegisterVerificationChallengeError,
  verifyRegisterEmailCode,
} from "@/modules/auth/server/register-verification-challenge";
import { logAuthInvalidBody } from "@/modules/auth/server/route-audit";

export async function POST(request: Request) {
  return withIdempotency("auth:register-verify-email", async () => {
    const ipGuard = await enforceFailClosedIpRateLimit({
      rateLimitAction: "register-verify-email",
      rateLimitMax: 10,
      rateLimitWindowSeconds: 900,
      auditActionName: "register-verify-email",
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
        action: "register_verification_failed",
        ip,
        metadata: { step: "verify_email" },
      });
      return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
    }

    const rawPayload = payload as Record<string, unknown>;
    const challengeId = typeof rawPayload.challengeId === "string" ? rawPayload.challengeId.trim() : "";

    if (challengeId) {
      const identifierRateLimit = await enforceFailClosedIdentifierRateLimit({
        rateLimitAction: "register-verify-email-challenge",
        identifier: challengeId,
        rateLimitMax: 8,
        rateLimitWindowSeconds: 900,
        auditActionName: "register-verify-email",
        auditScope: "challenge",
        ip,
      });
      if (identifierRateLimit) {
        return identifierRateLimit;
      }
    }

    try {
      const result = await verifyRegisterEmailCode(payload);

      await logAudit("register_verified", ip, undefined, {
        step: "verify_email",
        challengeId,
        result: "SUCCESS",
      });

      return NextResponse.json(ok({
        smsCodeExpiresAt: result.smsCodeExpiresAt.toISOString(),
        maskedPhone: result.maskedPhone,
      }), { status: 200 });
    } catch (error) {
      if (error instanceof z.ZodError) {
        await logAudit("register_verification_failed", ip, undefined, {
          step: "verify_email",
          reason: "VALIDATION_FAILED",
        });
        return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
      }

      if (error instanceof RegisterVerificationChallengeError) {
        const neutralizedChallengeCode =
          error.code === "INVALID_OR_EXPIRED_CHALLENGE" || error.code === "INVALID_EMAIL_CODE";
        const status =
          neutralizedChallengeCode ||
          error.code === "PHONE_NOT_AVAILABLE" ||
          error.code === "SMS_NOT_ENABLED" ||
          error.code === "SMS_DELIVERY_FAILED" ||
          error.code === "MAX_ATTEMPTS_REACHED"
            ? 400
            : 500;

        await logAudit("register_verification_failed", ip, undefined, {
          step: "verify_email",
          reason: neutralizedChallengeCode ? "VERIFICATION_CODE_REJECTED" : error.code,
        });
        return NextResponse.json(
          fail(neutralizedChallengeCode ? "INVALID_OR_EXPIRED_CHALLENGE" : error.code),
          { status },
        );
      }

      await logAudit("register_verification_failed", ip, undefined, {
        step: "verify_email",
        reason: "REGISTER_VERIFY_EMAIL_FAILED",
      });
      logServerError("register_verify_email_failed", error, {
        route: "/api/auth/register/challenge/verify-email",
        challengeId,
      });
      return NextResponse.json(fail("REGISTER_VERIFY_EMAIL_FAILED"), { status: 500 });
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

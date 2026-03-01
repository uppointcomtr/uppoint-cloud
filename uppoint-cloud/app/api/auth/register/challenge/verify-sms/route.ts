import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit-log";
import { withIdempotency } from "@/lib/http/idempotency";
import { fail, ok } from "@/lib/http/response";
import { getClientIp, withRateLimit, withRateLimitByIdentifier } from "@/lib/rate-limit";
import {
  RegisterVerificationChallengeError,
  verifyRegisterSmsCode,
} from "@/modules/auth/server/register-verification-challenge";

export async function POST(request: Request) {
  return withIdempotency("auth:register-verify-sms", async () => {
  // Rate limit: 10 attempts per 15 minutes per IP
  const rateLimitResponse = await withRateLimit("register-verify-sms", 10, 900);
  if (rateLimitResponse) {
    const limitedIp = await getClientIp();
    await logAudit("rate_limit_exceeded", limitedIp, undefined, {
      action: "register-verify-sms",
      scope: "ip",
    });
    return rateLimitResponse;
  }

  const ip = await getClientIp();

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  const rawPayload = payload as Record<string, unknown>;
  const challengeId = typeof rawPayload.challengeId === "string" ? rawPayload.challengeId.trim() : "";

  if (challengeId) {
    const identifierRateLimit = await withRateLimitByIdentifier("register-verify-sms-challenge", challengeId, 8, 900);
    if (identifierRateLimit) {
      await logAudit("rate_limit_exceeded", ip, undefined, {
        action: "register-verify-sms",
        scope: "challenge",
      });
      return identifierRateLimit;
    }
  }

  try {
    const result = await verifyRegisterSmsCode(payload);

    await logAudit("register_verified", ip, result.userId);
    return NextResponse.json(ok({ verified: true }), { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      await logAudit("register_verification_failed", ip, undefined, {
        step: "verify_sms",
        reason: "VALIDATION_FAILED",
      });
      return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
    }

    if (error instanceof RegisterVerificationChallengeError) {
      const neutralizedChallengeCode =
        error.code === "INVALID_OR_EXPIRED_CHALLENGE" || error.code === "INVALID_SMS_CODE";
      const status =
        neutralizedChallengeCode ||
        error.code === "MAX_ATTEMPTS_REACHED"
          ? 400
          : 500;

      await logAudit("register_verification_failed", ip, undefined, {
        step: "verify_sms",
        reason: neutralizedChallengeCode ? "VERIFICATION_CODE_REJECTED" : error.code,
      });
      return NextResponse.json(
        fail(neutralizedChallengeCode ? "INVALID_OR_EXPIRED_CHALLENGE" : error.code),
        { status },
      );
    }

    await logAudit("register_verification_failed", ip, undefined, {
      step: "verify_sms",
      reason: "REGISTER_VERIFY_SMS_FAILED",
    });
    console.error("Failed to verify register SMS code", error);
    return NextResponse.json(fail("REGISTER_VERIFY_SMS_FAILED"), { status: 500 });
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

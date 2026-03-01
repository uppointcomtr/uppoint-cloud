import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit-log";
import { fail, ok } from "@/lib/http/response";
import { getClientIp, withRateLimit } from "@/lib/rate-limit";
import {
  RegisterVerificationChallengeError,
  verifyRegisterEmailCode,
} from "@/modules/auth/server/register-verification-challenge";

export async function POST(request: Request) {
  // Rate limit: 10 attempts per 15 minutes per IP
  const rateLimitResponse = await withRateLimit("register-verify-email", 10, 900);
  if (rateLimitResponse) return rateLimitResponse;

  const ip = await getClientIp();

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  try {
    const result = await verifyRegisterEmailCode(payload);

    return NextResponse.json(ok({
      smsCodeExpiresAt: result.smsCodeExpiresAt.toISOString(),
      maskedPhone: result.maskedPhone,
    }), { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logAudit("register_verification_failed", ip, undefined, {
        step: "verify_email",
        reason: "VALIDATION_FAILED",
      });
      return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
    }

    if (error instanceof RegisterVerificationChallengeError) {
      const status =
        error.code === "INVALID_OR_EXPIRED_CHALLENGE" ||
        error.code === "INVALID_EMAIL_CODE" ||
        error.code === "PHONE_NOT_AVAILABLE" ||
        error.code === "SMS_NOT_ENABLED" ||
        error.code === "SMS_DELIVERY_FAILED" ||
        error.code === "MAX_ATTEMPTS_REACHED"
          ? 400
          : 500;

      logAudit("register_verification_failed", ip, undefined, {
        step: "verify_email",
        reason: error.code,
      });
      return NextResponse.json(fail(error.code), { status });
    }

    logAudit("register_verification_failed", ip, undefined, {
      step: "verify_email",
      reason: "REGISTER_VERIFY_EMAIL_FAILED",
    });
    console.error("Failed to verify register email code", error);
    return NextResponse.json(fail("REGISTER_VERIFY_EMAIL_FAILED"), { status: 500 });
  }
}

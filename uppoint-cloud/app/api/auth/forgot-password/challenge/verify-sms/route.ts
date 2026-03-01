import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit-log";
import { fail, ok } from "@/lib/http/response";
import { getClientIp, withRateLimit } from "@/lib/rate-limit";
import {
  PasswordResetChallengeError,
  verifyPasswordResetSmsCode,
} from "@/modules/auth/server/password-reset-challenge";

export async function POST(request: Request) {
  // Rate limit: 10 attempts per 15 minutes per IP
  const rateLimitResponse = await withRateLimit("forgot-password-verify-sms", 10, 900);
  if (rateLimitResponse) return rateLimitResponse;
  const ip = await getClientIp();

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  try {
    const result = await verifyPasswordResetSmsCode(payload);

    return NextResponse.json(
      ok({
        resetToken: result.resetToken,
      }),
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      logAudit("password_reset_failed", ip, undefined, {
        step: "verify_sms",
        reason: "VALIDATION_FAILED",
      });
      return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
    }

    if (error instanceof PasswordResetChallengeError) {
      const status =
        error.code === "INVALID_OR_EXPIRED_CHALLENGE" ||
        error.code === "INVALID_SMS_CODE" ||
        error.code === "MAX_ATTEMPTS_REACHED"
          ? 400
          : 500;

      logAudit("password_reset_failed", ip, undefined, {
        step: "verify_sms",
        reason: error.code,
      });
      return NextResponse.json(fail(error.code), { status });
    }

    logAudit("password_reset_failed", ip, undefined, {
      step: "verify_sms",
      reason: "FORGOT_PASSWORD_VERIFY_SMS_FAILED",
    });
    console.error("Failed to verify forgot-password SMS code", error);
    return NextResponse.json(fail("FORGOT_PASSWORD_VERIFY_SMS_FAILED"), {
      status: 500,
    });
  }
}

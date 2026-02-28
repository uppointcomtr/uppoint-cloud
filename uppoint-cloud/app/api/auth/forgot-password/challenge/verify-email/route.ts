import { NextResponse } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/http/response";
import { withRateLimit } from "@/lib/rate-limit";
import {
  PasswordResetChallengeError,
  verifyPasswordResetEmailCode,
} from "@/modules/auth/server/password-reset-challenge";

export async function POST(request: Request) {
  // Rate limit: 10 attempts per 15 minutes per IP
  const rateLimitResponse = await withRateLimit("forgot-password-verify-email", 10, 900);
  if (rateLimitResponse) return rateLimitResponse;

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  try {
    const result = await verifyPasswordResetEmailCode(payload);

    return NextResponse.json(
      ok({
        smsCodeExpiresAt: result.smsCodeExpiresAt.toISOString(),
        maskedPhone: result.maskedPhone,
      }),
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
    }

    if (error instanceof PasswordResetChallengeError) {
      const status =
        error.code === "INVALID_OR_EXPIRED_CHALLENGE" ||
        error.code === "INVALID_EMAIL_CODE" ||
        error.code === "PHONE_NOT_AVAILABLE" ||
        error.code === "SMS_NOT_ENABLED" ||
        error.code === "MAX_ATTEMPTS_REACHED"
          ? 400
          : 500;

      return NextResponse.json(fail(error.code), { status });
    }

    console.error("Failed to verify forgot-password email code", error);
    return NextResponse.json(fail("FORGOT_PASSWORD_VERIFY_EMAIL_FAILED"), {
      status: 500,
    });
  }
}

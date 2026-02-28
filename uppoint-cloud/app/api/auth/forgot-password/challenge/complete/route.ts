import { NextResponse } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/http/response";
import { withRateLimit } from "@/lib/rate-limit";
import {
  completePasswordResetChallenge,
  PasswordResetChallengeError,
} from "@/modules/auth/server/password-reset-challenge";

export async function POST(request: Request) {
  // Rate limit: 5 attempts per 10 minutes per IP
  const rateLimitResponse = await withRateLimit("forgot-password-complete", 5, 600);
  if (rateLimitResponse) return rateLimitResponse;

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  try {
    await completePasswordResetChallenge(payload);

    return NextResponse.json(ok({ reset: true }), { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
    }

    if (error instanceof PasswordResetChallengeError) {
      const status =
        error.code === "INVALID_OR_EXPIRED_RESET_TOKEN" ||
        error.code === "RESET_TOKEN_NOT_READY" ||
        error.code === "INVALID_OR_EXPIRED_CHALLENGE"
          ? 400
          : 500;

      return NextResponse.json(fail(error.code), { status });
    }

    console.error("Failed to complete forgot-password challenge", error);
    return NextResponse.json(fail("FORGOT_PASSWORD_COMPLETE_FAILED"), {
      status: 500,
    });
  }
}

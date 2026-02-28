import { NextResponse } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/http/response";
import {
  completePasswordResetChallenge,
  PasswordResetChallengeError,
} from "@/modules/auth/server/password-reset-challenge";

export async function POST(request: Request) {
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

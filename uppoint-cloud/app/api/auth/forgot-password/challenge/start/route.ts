import { NextResponse } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/http/response";
import { startPasswordResetChallenge } from "@/modules/auth/server/password-reset-challenge";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  try {
    const result = await startPasswordResetChallenge(payload);

    return NextResponse.json(
      ok({
        hasChallenge: Boolean(result.challengeId),
        challengeId: result.challengeId,
        emailCodeExpiresAt: result.emailCodeExpiresAt?.toISOString() ?? null,
      }),
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
    }

    console.error("Failed to start forgot-password challenge", error);
    return NextResponse.json(fail("FORGOT_PASSWORD_CHALLENGE_START_FAILED"), {
      status: 500,
    });
  }
}

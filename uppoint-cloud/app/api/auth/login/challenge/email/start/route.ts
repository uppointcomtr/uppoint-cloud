import { NextResponse } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/http/response";
import { withRateLimit } from "@/lib/rate-limit";
import { startEmailLoginChallenge } from "@/modules/auth/server/login-challenge";

export async function POST(request: Request) {
  // Rate limit: 10 attempts per 15 minutes per IP
  const rateLimitResponse = await withRateLimit("login-email-start", 10, 900);
  if (rateLimitResponse) return rateLimitResponse;

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  try {
    const result = await startEmailLoginChallenge(payload);

    return NextResponse.json(
      ok({
        hasChallenge: Boolean(result.challengeId),
        challengeId: result.challengeId,
        codeExpiresAt: result.codeExpiresAt?.toISOString() ?? null,
      }),
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
    }

    if (
      error instanceof Error &&
      /recipients were rejected|recipient address reserved/i.test(error.message)
    ) {
      return NextResponse.json(fail("EMAIL_DELIVERY_FAILED"), {
        status: 400,
      });
    }

    console.error("Failed to start email login challenge", error);
    return NextResponse.json(fail("LOGIN_CHALLENGE_START_FAILED"), {
      status: 500,
    });
  }
}

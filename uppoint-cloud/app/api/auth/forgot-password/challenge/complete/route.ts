import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit-log";
import { withIdempotency } from "@/lib/http/idempotency";
import { fail, ok } from "@/lib/http/response";
import { getClientIp, withRateLimit, withRateLimitByIdentifier } from "@/lib/rate-limit";
import {
  completePasswordResetChallenge,
  PasswordResetChallengeError,
} from "@/modules/auth/server/password-reset-challenge";

export async function POST(request: Request) {
  return withIdempotency("auth:forgot-password-complete", async () => {
  // Rate limit: 5 attempts per 10 minutes per IP
  const rateLimitResponse = await withRateLimit("forgot-password-complete", 5, 600);
  if (rateLimitResponse) {
    const limitedIp = await getClientIp();
    logAudit("rate_limit_exceeded", limitedIp, undefined, {
      action: "forgot-password-complete",
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
    const identifierRateLimit = await withRateLimitByIdentifier("forgot-password-complete-challenge", challengeId, 6, 900);
    if (identifierRateLimit) {
      logAudit("rate_limit_exceeded", ip, undefined, {
        action: "forgot-password-complete",
        scope: "challenge",
      });
      return identifierRateLimit;
    }
  }

  try {
    await completePasswordResetChallenge(payload);

    logAudit("password_reset_success", ip);

    return NextResponse.json(ok({ reset: true }), { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logAudit("password_reset_failed", ip, undefined, {
        step: "complete",
        reason: "VALIDATION_FAILED",
      });
      return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
    }

    if (error instanceof PasswordResetChallengeError) {
      const status =
        error.code === "INVALID_OR_EXPIRED_RESET_TOKEN" ||
        error.code === "RESET_TOKEN_NOT_READY" ||
        error.code === "INVALID_OR_EXPIRED_CHALLENGE"
          ? 400
          : 500;

      logAudit("password_reset_failed", ip, undefined, {
        step: "complete",
        reason: error.code,
      });
      return NextResponse.json(fail(error.code), { status });
    }

    logAudit("password_reset_failed", ip, undefined, {
      step: "complete",
      reason: "FORGOT_PASSWORD_COMPLETE_FAILED",
    });
    console.error("Failed to complete forgot-password challenge", error);
    return NextResponse.json(fail("FORGOT_PASSWORD_COMPLETE_FAILED"), {
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

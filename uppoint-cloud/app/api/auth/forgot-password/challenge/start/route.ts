import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit-log";
import { fail, ok } from "@/lib/http/response";
import { getClientIp, withRateLimit, withRateLimitByIdentifier } from "@/lib/rate-limit";
import { startPasswordResetChallenge } from "@/modules/auth/server/password-reset-challenge";

export async function POST(request: Request) {
  // Rate limit: 5 attempts per 10 minutes per IP
  const rateLimitResponse = await withRateLimit("forgot-password-challenge-start", 5, 600);
  if (rateLimitResponse) {
    const limitedIp = await getClientIp();
    logAudit("rate_limit_exceeded", limitedIp, undefined, {
      action: "forgot-password-challenge-start",
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
  const email = typeof rawPayload.email === "string" ? rawPayload.email.trim().toLowerCase() : "";

  if (email) {
    const identifierRateLimit = await withRateLimitByIdentifier(
      "forgot-password-challenge-start-account",
      email,
      5,
      600,
    );

    if (identifierRateLimit) {
      logAudit("rate_limit_exceeded", ip, undefined, {
        action: "forgot-password-challenge-start",
        scope: "email",
      });
      return identifierRateLimit;
    }
  }

  try {
    const result = await startPasswordResetChallenge(payload);

    logAudit("password_reset_requested", ip, undefined, {
      hasChallenge: Boolean(result.challengeId),
    });

    if (!result.challengeId) {
      logAudit("password_reset_failed", ip, undefined, {
        step: "start",
        reason: "ACCOUNT_NOT_FOUND_OR_HIDDEN",
      });
    }

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
      logAudit("password_reset_failed", ip, undefined, {
        step: "start",
        reason: "VALIDATION_FAILED",
      });
      return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
    }

    logAudit("password_reset_failed", ip, undefined, {
      step: "start",
      reason: "FORGOT_PASSWORD_CHALLENGE_START_FAILED",
    });
    console.error("Failed to start forgot-password challenge", error);
    return NextResponse.json(fail("FORGOT_PASSWORD_CHALLENGE_START_FAILED"), {
      status: 500,
    });
  }
}

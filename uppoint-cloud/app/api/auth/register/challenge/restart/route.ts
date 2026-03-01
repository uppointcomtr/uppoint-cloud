import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit-log";
import { withIdempotency } from "@/lib/http/idempotency";
import { fail, ok } from "@/lib/http/response";
import { getClientIp, withRateLimit, withRateLimitByIdentifier } from "@/lib/rate-limit";
import {
  RegisterVerificationChallengeError,
  startRegisterVerificationChallenge,
} from "@/modules/auth/server/register-verification-challenge";

export async function POST(request: Request) {
  return withIdempotency("auth:register-verify-restart", async () => {
  // Rate limit: 5 attempts per 10 minutes per IP
  const rateLimitResponse = await withRateLimit("register-verify-restart", 5, 600);
  if (rateLimitResponse) {
    const limitedIp = await getClientIp();
    logAudit("rate_limit_exceeded", limitedIp, undefined, {
      action: "register-verify-restart",
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
  const userId = typeof rawPayload.userId === "string" ? rawPayload.userId.trim() : "";

  if (userId) {
    const identifierRateLimit = await withRateLimitByIdentifier(
      "register-verify-restart-user",
      userId,
      5,
      600,
    );

    if (identifierRateLimit) {
      logAudit("rate_limit_exceeded", ip, undefined, {
        action: "register-verify-restart",
        scope: "userId",
      });
      return identifierRateLimit;
    }
  }

  try {
    const result = await startRegisterVerificationChallenge(payload);

    return NextResponse.json(ok({
      challengeId: result.challengeId,
      emailCodeExpiresAt: result.emailCodeExpiresAt.toISOString(),
    }), { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logAudit("register_verification_failed", ip, undefined, {
        step: "restart",
        reason: "VALIDATION_FAILED",
      });
      return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
    }

    if (error instanceof RegisterVerificationChallengeError) {
      if (error.code === "USER_NOT_FOUND") {
        // Security-sensitive: keep response shape/status neutral to avoid account existence disclosure.
        logAudit("register_verification_failed", ip, undefined, {
          step: "restart",
          reason: "ACCOUNT_HIDDEN",
        });
        return NextResponse.json(ok({ accepted: true }), { status: 200 });
      }

      logAudit("register_verification_failed", ip, undefined, {
        step: "restart",
        reason: error.code,
      });
      return NextResponse.json(fail(error.code), { status: 500 });
    }

    logAudit("register_verification_failed", ip, undefined, {
      step: "restart",
      reason: "REGISTER_VERIFY_RESTART_FAILED",
    });
    console.error("Failed to restart register verification challenge", error);
    return NextResponse.json(fail("REGISTER_VERIFY_RESTART_FAILED"), { status: 500 });
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

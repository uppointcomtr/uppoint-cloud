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
  return withIdempotency("auth:register", async () => {
  // Rate limit: 5 registration attempts per 10 minutes per IP
  const rateLimitResponse = await withRateLimit("register", 5, 600);
  if (rateLimitResponse) {
    const limitedIp = await getClientIp();
    logAudit("rate_limit_exceeded", limitedIp, undefined, {
      action: "register",
      scope: "ip",
    });
    return rateLimitResponse;
  }

  const ip = await getClientIp();

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(fail("INVALID_BODY"), {
      status: 400,
    });
  }

  const rawPayload = payload as Record<string, unknown>;
  const normalizedEmail = typeof rawPayload.email === "string" ? rawPayload.email.trim().toLowerCase() : null;

  if (normalizedEmail) {
    const identifierRateLimit = await withRateLimitByIdentifier("register-email", normalizedEmail, 3, 600);
    if (identifierRateLimit) {
      logAudit("rate_limit_exceeded", ip, undefined, {
        action: "register",
        scope: "email",
      });
      return identifierRateLimit;
    }
  }

  try {
    const challenge = await startRegisterVerificationChallenge(payload);

    logAudit("register_success", ip, undefined, {
      step: "challenge_started",
      email: normalizedEmail,
    });

    return NextResponse.json(ok({
      accepted: true,
      hasChallenge: true,
      challengeId: challenge.challengeId,
      emailCodeExpiresAt: challenge.emailCodeExpiresAt.toISOString(),
    }), {
      status: 201,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logAudit("register_verification_failed", ip, undefined, {
        step: "start",
        reason: "VALIDATION_FAILED",
      });
      return NextResponse.json(fail("VALIDATION_FAILED"), {
        status: 400,
      });
    }

    if (error instanceof RegisterVerificationChallengeError && error.code === "EMAIL_TAKEN") {
      logAudit("register_verification_failed", ip, undefined, {
        step: "start",
        reason: "ACCOUNT_HIDDEN",
      });
      // Security-sensitive: keep response neutral to reduce account enumeration risk.
      return NextResponse.json(ok({
        accepted: true,
        hasChallenge: false,
      }), {
        status: 202,
      });
    }

    if (error instanceof RegisterVerificationChallengeError) {
      logAudit("register_verification_failed", ip, undefined, {
        step: "start",
        reason: error.code,
      });
      return NextResponse.json(fail("REGISTER_VERIFICATION_START_FAILED"), {
        status: 500,
      });
    }

    logAudit("register_verification_failed", ip, undefined, {
      step: "start",
      reason: "REGISTER_VERIFICATION_START_FAILED",
    });
    console.error("Failed to register user", error);
    return NextResponse.json(fail("REGISTER_VERIFICATION_START_FAILED"), {
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

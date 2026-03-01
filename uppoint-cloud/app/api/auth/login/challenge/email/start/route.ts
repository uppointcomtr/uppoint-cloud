import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit-log";
import { withIdempotency } from "@/lib/http/idempotency";
import { fail, ok } from "@/lib/http/response";
import { getClientIp, withRateLimit, withRateLimitByIdentifier } from "@/lib/rate-limit";
import {
  LoginChallengeError,
  startEmailLoginChallenge,
} from "@/modules/auth/server/login-challenge";

export async function POST(request: Request) {
  return withIdempotency("auth:login-email-start", async () => {
  // Rate limit: 10 attempts per 15 minutes per IP
  const rateLimitResponse = await withRateLimit("login-email-start", 10, 900);
  if (rateLimitResponse) {
    const limitedIp = await getClientIp();
    logAudit("rate_limit_exceeded", limitedIp, undefined, {
      action: "login-email-start",
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
    const identifierRateLimit = await withRateLimitByIdentifier("login-email-start-account", email, 8, 900);
    if (identifierRateLimit) {
      logAudit("rate_limit_exceeded", ip, undefined, {
        action: "login-email-start",
        scope: "email",
      });
      return identifierRateLimit;
    }
  }

  try {
    const result = await startEmailLoginChallenge(payload);

    if (!result.challengeId) {
      logAudit("login_challenge_start_failed", ip, undefined, {
        mode: "email",
        reason: "INVALID_CREDENTIALS",
      });
    }

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

    if (error instanceof LoginChallengeError && error.code === "EMAIL_NOT_VERIFIED") {
      logAudit("login_challenge_start_failed", ip, undefined, {
        mode: "email",
        reason: error.code,
      });
      return NextResponse.json(fail(error.code), {
        status: 403,
      });
    }

    if (
      error instanceof Error &&
      /recipients were rejected|recipient address reserved/i.test(error.message)
    ) {
      logAudit("login_challenge_start_failed", ip, undefined, {
        mode: "email",
        reason: "EMAIL_DELIVERY_FAILED",
      });
      return NextResponse.json(fail("EMAIL_DELIVERY_FAILED"), {
        status: 400,
      });
    }

    logAudit("login_challenge_start_failed", ip, undefined, {
      mode: "email",
      reason: "LOGIN_CHALLENGE_START_FAILED",
    });
    console.error("Failed to start email login challenge", error);
    return NextResponse.json(fail("LOGIN_CHALLENGE_START_FAILED"), {
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

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

function buildNeutralStartResponse() {
  return NextResponse.json(
    ok({ hasChallenge: false, challengeId: null, codeExpiresAt: null }),
    { status: 200 },
  );
}

export async function POST(request: Request) {
  return withIdempotency("auth:login-email-start", async () => {
  // Rate limit: 10 attempts per 15 minutes per IP
  const rateLimitResponse = await withRateLimit("login-email-start", 10, 900);
  if (rateLimitResponse) {
    const limitedIp = await getClientIp();
    await logAudit("rate_limit_exceeded", limitedIp, undefined, {
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
      await logAudit("rate_limit_exceeded", ip, undefined, {
        action: "login-email-start",
        scope: "email",
      });
      return identifierRateLimit;
    }
  }

  try {
    const result = await startEmailLoginChallenge(payload);

    if (result.challengeId) {
      await logAudit("login_challenge_started", ip, undefined, {
        mode: "email",
        challengeId: result.challengeId,
        result: "SUCCESS",
      });
    } else {
      await logAudit("login_challenge_start_failed", ip, undefined, {
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

    if (error instanceof LoginChallengeError) {
      // Security-sensitive: avoid leaking account/provider state from challenge start endpoint.
      await logAudit("login_challenge_start_failed", ip, undefined, {
        mode: "email",
        reason: error.code,
      });
      return buildNeutralStartResponse();
    }

    await logAudit("login_challenge_start_failed", ip, undefined, {
      mode: "email",
      reason: "LOGIN_CHALLENGE_START_FAILED",
    });
    return buildNeutralStartResponse();
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

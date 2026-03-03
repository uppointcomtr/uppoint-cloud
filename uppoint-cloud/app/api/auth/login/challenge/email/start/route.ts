import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit-log";
import { withIdempotency } from "@/lib/http/idempotency";
import { fail, ok } from "@/lib/http/response";
import { enforceFailClosedIdentifierRateLimit, enforceFailClosedIpRateLimit } from "@/lib/security/route-guard";
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
  const ipGuard = await enforceFailClosedIpRateLimit({
    rateLimitAction: "login-email-start",
    rateLimitMax: 10,
    rateLimitWindowSeconds: 900,
    auditActionName: "login-email-start",
    auditScope: "ip",
  });
  if (ipGuard.blockedResponse) {
    return ipGuard.blockedResponse;
  }
  const ip = ipGuard.ip;

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  const rawPayload = payload as Record<string, unknown>;
  const email = typeof rawPayload.email === "string" ? rawPayload.email.trim().toLowerCase() : "";

  if (email) {
    const identifierRateLimit = await enforceFailClosedIdentifierRateLimit({
      rateLimitAction: "login-email-start-account",
      identifier: email,
      rateLimitMax: 8,
      rateLimitWindowSeconds: 900,
      auditActionName: "login-email-start",
      auditScope: "email",
      ip,
    });
    if (identifierRateLimit) {
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

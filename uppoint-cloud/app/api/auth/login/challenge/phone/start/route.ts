import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit-log";
import { withIdempotency } from "@/lib/http/idempotency";
import { fail, ok } from "@/lib/http/response";
import { enforceFailClosedIdentifierRateLimit, enforceFailClosedIpRateLimit } from "@/lib/security/route-guard";
import {
  LoginChallengeError,
  startPhoneLoginChallenge,
} from "@/modules/auth/server/login-challenge";

function buildNeutralStartResponse() {
  return NextResponse.json(
    ok({ hasChallenge: false, challengeId: null, codeExpiresAt: null }),
    { status: 200 },
  );
}

function normalizePhoneForRateLimit(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

export async function POST(request: Request) {
  return withIdempotency("auth:login-phone-start", async () => {
  const ipGuard = await enforceFailClosedIpRateLimit({
    rateLimitAction: "login-phone-start",
    rateLimitMax: 10,
    rateLimitWindowSeconds: 900,
    auditActionName: "login-phone-start",
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
  const phone = typeof rawPayload.phone === "string" ? rawPayload.phone.trim() : "";
  const normalizedPhone = normalizePhoneForRateLimit(phone);

  if (normalizedPhone) {
    const identifierRateLimit = await enforceFailClosedIdentifierRateLimit({
      rateLimitAction: "login-phone-start-account",
      identifier: normalizedPhone,
      rateLimitMax: 8,
      rateLimitWindowSeconds: 900,
      auditActionName: "login-phone-start",
      auditScope: "phone",
      ip,
    });
    if (identifierRateLimit) {
      return identifierRateLimit;
    }
  }

  try {
    const result = await startPhoneLoginChallenge(payload);

    if (result.challengeId) {
      await logAudit("login_challenge_started", ip, undefined, {
        mode: "phone",
        challengeId: result.challengeId,
        result: "SUCCESS",
      });
    } else {
      await logAudit("login_challenge_start_failed", ip, undefined, {
        mode: "phone",
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
        mode: "phone",
        reason: error.code,
      });
      return buildNeutralStartResponse();
    }

    await logAudit("login_challenge_start_failed", ip, undefined, {
      mode: "phone",
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

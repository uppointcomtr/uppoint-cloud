import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit-log";
import { withIdempotency } from "@/lib/http/idempotency";
import { fail, ok } from "@/lib/http/response";
import { enforceFailClosedIdentifierRateLimit, enforceFailClosedIpRateLimit } from "@/lib/security/route-guard";
import { startPasswordResetChallenge } from "@/modules/auth/server/password-reset-challenge";

export async function POST(request: Request) {
  return withIdempotency("auth:forgot-password-start", async () => {
  const ipGuard = await enforceFailClosedIpRateLimit({
    rateLimitAction: "forgot-password-challenge-start",
    rateLimitMax: 5,
    rateLimitWindowSeconds: 600,
    auditActionName: "forgot-password-challenge-start",
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
      rateLimitAction: "forgot-password-challenge-start-account",
      identifier: email,
      rateLimitMax: 5,
      rateLimitWindowSeconds: 600,
      auditActionName: "forgot-password-challenge-start",
      auditScope: "email",
      ip,
    });

    if (identifierRateLimit) {
      return identifierRateLimit;
    }
  }

  try {
    const result = await startPasswordResetChallenge(payload);

    await logAudit("password_reset_requested", ip, undefined, {
      hasChallenge: Boolean(result.challengeId),
    });

    if (!result.challengeId) {
      await logAudit("password_reset_failed", ip, undefined, {
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
      await logAudit("password_reset_failed", ip, undefined, {
        step: "start",
        reason: "VALIDATION_FAILED",
      });
      return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
    }

    await logAudit("password_reset_failed", ip, undefined, {
      step: "start",
      reason: "FORGOT_PASSWORD_CHALLENGE_START_FAILED",
    });
    console.error("Failed to start forgot-password challenge", error);
    return NextResponse.json(fail("FORGOT_PASSWORD_CHALLENGE_START_FAILED"), {
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

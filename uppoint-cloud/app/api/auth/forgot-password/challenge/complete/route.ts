import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit-log";
import { withIdempotency } from "@/lib/http/idempotency";
import { fail, ok } from "@/lib/http/response";
import { enforceFailClosedIdentifierRateLimit, enforceFailClosedIpRateLimit } from "@/lib/security/route-guard";
import {
  completePasswordResetChallenge,
  PasswordResetChallengeError,
} from "@/modules/auth/server/password-reset-challenge";
import { logAuthInvalidBody } from "@/modules/auth/server/route-audit";

export async function POST(request: Request) {
  return withIdempotency("auth:forgot-password-complete", async () => {
  const ipGuard = await enforceFailClosedIpRateLimit({
    rateLimitAction: "forgot-password-complete",
    rateLimitMax: 5,
    rateLimitWindowSeconds: 600,
    auditActionName: "forgot-password-complete",
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
    await logAuthInvalidBody({
      action: "password_reset_failed",
      ip,
      metadata: { step: "complete" },
    });
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  const rawPayload = payload as Record<string, unknown>;
  const challengeId = typeof rawPayload.challengeId === "string" ? rawPayload.challengeId.trim() : "";

  if (challengeId) {
    const identifierRateLimit = await enforceFailClosedIdentifierRateLimit({
      rateLimitAction: "forgot-password-complete-challenge",
      identifier: challengeId,
      rateLimitMax: 6,
      rateLimitWindowSeconds: 900,
      auditActionName: "forgot-password-complete",
      auditScope: "challenge",
      ip,
    });
    if (identifierRateLimit) {
      return identifierRateLimit;
    }
  }

  try {
    const completion = await completePasswordResetChallenge(payload);

    await logAudit("password_reset_success", ip, completion.userId);

    return NextResponse.json(ok({ reset: true }), { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      await logAudit("password_reset_failed", ip, undefined, {
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

      await logAudit("password_reset_failed", ip, undefined, {
        step: "complete",
        reason: error.code,
      });
      return NextResponse.json(fail(error.code), { status });
    }

    await logAudit("password_reset_failed", ip, undefined, {
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

import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit-log";
import { withIdempotency } from "@/lib/http/idempotency";
import { fail, ok } from "@/lib/http/response";
import { enforceFailClosedIdentifierRateLimit, enforceFailClosedIpRateLimit } from "@/lib/security/route-guard";
import {
  RegisterVerificationChallengeError,
  restartRegisterVerificationChallenge,
} from "@/modules/auth/server/register-verification-challenge";
import { logAuthInvalidBody } from "@/modules/auth/server/route-audit";

export async function POST(request: Request) {
  return withIdempotency("auth:register-verify-restart", async () => {
  const ipGuard = await enforceFailClosedIpRateLimit({
    rateLimitAction: "register-verify-restart",
    rateLimitMax: 5,
    rateLimitWindowSeconds: 600,
    auditActionName: "register-verify-restart",
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
      action: "register_verification_failed",
      ip,
      metadata: { step: "restart" },
    });
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  const rawPayload = payload as Record<string, unknown>;
  const challengeId = typeof rawPayload.challengeId === "string" ? rawPayload.challengeId.trim() : "";

  if (challengeId) {
    const identifierRateLimit = await enforceFailClosedIdentifierRateLimit({
      rateLimitAction: "register-verify-restart-challenge",
      identifier: challengeId,
      rateLimitMax: 5,
      rateLimitWindowSeconds: 600,
      auditActionName: "register-verify-restart",
      auditScope: "challengeId",
      ip,
    });

    if (identifierRateLimit) {
      return identifierRateLimit;
    }
  }

  try {
    const result = await restartRegisterVerificationChallenge(payload);
    await logAudit("register_verification_restarted", ip, undefined, {
      step: "restart",
      challengeId: result.challengeId,
      result: "SUCCESS",
    });

    return NextResponse.json(ok({
      challengeId: result.challengeId,
      emailCodeExpiresAt: result.emailCodeExpiresAt.toISOString(),
    }), { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      await logAudit("register_verification_failed", ip, undefined, {
        step: "restart",
        reason: "VALIDATION_FAILED",
      });
      return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
    }

    if (error instanceof RegisterVerificationChallengeError) {
      if (error.code === "INVALID_OR_EXPIRED_CHALLENGE" || error.code === "EMAIL_TAKEN") {
        // Security-sensitive: keep response shape/status neutral to avoid account existence disclosure.
        await logAudit("register_verification_failed", ip, undefined, {
          step: "restart",
          reason: "ACCOUNT_HIDDEN",
        });
        return NextResponse.json(ok({ accepted: true }), { status: 200 });
      }

      await logAudit("register_verification_failed", ip, undefined, {
        step: "restart",
        reason: error.code,
      });
      return NextResponse.json(fail(error.code), { status: 500 });
    }

    await logAudit("register_verification_failed", ip, undefined, {
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

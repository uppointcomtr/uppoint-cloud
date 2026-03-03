import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit-log";
import { withIdempotency } from "@/lib/http/idempotency";
import { fail, ok } from "@/lib/http/response";
import { enforceFailClosedIdentifierRateLimit, enforceFailClosedIpRateLimit } from "@/lib/security/route-guard";
import {
  LoginChallengeError,
  verifyLoginChallengeCode,
} from "@/modules/auth/server/login-challenge";

export async function POST(request: Request) {
  return withIdempotency("auth:login-email-verify", async () => {
  const ipGuard = await enforceFailClosedIpRateLimit({
    rateLimitAction: "login-email-verify",
    rateLimitMax: 10,
    rateLimitWindowSeconds: 900,
    auditActionName: "login-email-verify",
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
  const challengeId = typeof rawPayload.challengeId === "string" ? rawPayload.challengeId.trim() : "";

  if (challengeId) {
    const identifierRateLimit = await enforceFailClosedIdentifierRateLimit({
      rateLimitAction: "login-email-verify-challenge",
      identifier: challengeId,
      rateLimitMax: 8,
      rateLimitWindowSeconds: 900,
      auditActionName: "login-email-verify",
      auditScope: "challenge",
      ip,
    });
    if (identifierRateLimit) {
      return identifierRateLimit;
    }
  }

  try {
    const result = await verifyLoginChallengeCode(payload, "email");

    await logAudit("login_challenge_verified", ip, result.userId, {
      mode: "email",
      result: "SUCCESS",
    });

    return NextResponse.json(ok({ loginToken: result.loginToken }), { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      await logAudit("login_otp_failed", ip, undefined, {
        mode: "email",
        reason: "VALIDATION_FAILED",
      });
      return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
    }

    if (error instanceof LoginChallengeError) {
      const status =
        error.code === "INVALID_OR_EXPIRED_CHALLENGE" ||
        error.code === "INVALID_CODE" ||
        error.code === "MAX_ATTEMPTS_REACHED"
          ? 400
          : 500;

      if (error.code === "INVALID_CODE" || error.code === "MAX_ATTEMPTS_REACHED") {
        await logAudit("login_otp_failed", ip, undefined, { mode: "email", reason: error.code });
      } else {
        await logAudit("login_otp_failed", ip, undefined, {
          mode: "email",
          reason: "VERIFICATION_REJECTED",
        });
      }

      return NextResponse.json(fail(error.code), { status });
    }

    await logAudit("login_otp_failed", ip, undefined, {
      mode: "email",
      reason: "LOGIN_CHALLENGE_VERIFY_FAILED",
    });
    console.error("Failed to verify email login challenge", error);
    return NextResponse.json(fail("LOGIN_CHALLENGE_VERIFY_FAILED"), {
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

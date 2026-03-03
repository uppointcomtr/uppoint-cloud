import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit-log";
import { withIdempotency } from "@/lib/http/idempotency";
import { fail, ok } from "@/lib/http/response";
import { getClientIp, withRateLimit, withRateLimitByIdentifier } from "@/lib/rate-limit";
import {
  LoginChallengeError,
  verifyLoginChallengeCode,
} from "@/modules/auth/server/login-challenge";

export async function POST(request: Request) {
  return withIdempotency("auth:login-phone-verify", async () => {
  // Rate limit: 10 attempts per 15 minutes per IP
  const rateLimitResponse = await withRateLimit("login-phone-verify", 10, 900);
  if (rateLimitResponse) {
    const limitedIp = await getClientIp();
    await logAudit("rate_limit_exceeded", limitedIp, undefined, {
      action: "login-phone-verify",
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
  const challengeId = typeof rawPayload.challengeId === "string" ? rawPayload.challengeId.trim() : "";

  if (challengeId) {
    const identifierRateLimit = await withRateLimitByIdentifier("login-phone-verify-challenge", challengeId, 8, 900);
    if (identifierRateLimit) {
      await logAudit("rate_limit_exceeded", ip, undefined, {
        action: "login-phone-verify",
        scope: "challenge",
      });
      return identifierRateLimit;
    }
  }

  try {
    const result = await verifyLoginChallengeCode(payload, "phone");

    await logAudit("login_challenge_verified", ip, result.userId, {
      mode: "phone",
      result: "SUCCESS",
    });

    return NextResponse.json(ok({ loginToken: result.loginToken }), { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      await logAudit("login_otp_failed", ip, undefined, {
        mode: "phone",
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
        await logAudit("login_otp_failed", ip, undefined, { mode: "phone", reason: error.code });
      } else {
        await logAudit("login_otp_failed", ip, undefined, {
          mode: "phone",
          reason: "VERIFICATION_REJECTED",
        });
      }

      return NextResponse.json(fail(error.code), { status });
    }

    await logAudit("login_otp_failed", ip, undefined, {
      mode: "phone",
      reason: "LOGIN_CHALLENGE_VERIFY_FAILED",
    });
    console.error("Failed to verify phone login challenge", error);
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

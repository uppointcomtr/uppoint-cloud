import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit-log";
import { fail, ok } from "@/lib/http/response";
import { getClientIp, withRateLimit } from "@/lib/rate-limit";
import {
  LoginChallengeError,
  startPhoneLoginChallenge,
} from "@/modules/auth/server/login-challenge";

export async function POST(request: Request) {
  // Rate limit: 10 attempts per 15 minutes per IP
  const rateLimitResponse = await withRateLimit("login-phone-start", 10, 900);
  if (rateLimitResponse) return rateLimitResponse;
  const ip = await getClientIp();

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  try {
    const result = await startPhoneLoginChallenge(payload);

    if (!result.challengeId) {
      logAudit("login_challenge_start_failed", ip, undefined, {
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
      if (error.code === "SMS_NOT_ENABLED") {
        logAudit("login_challenge_start_failed", ip, undefined, {
          mode: "phone",
          reason: error.code,
        });
        return NextResponse.json(fail("SMS_NOT_ENABLED"), { status: 400 });
      }

      if (error.code === "EMAIL_NOT_VERIFIED") {
        logAudit("login_challenge_start_failed", ip, undefined, {
          mode: "phone",
          reason: error.code,
        });
        return NextResponse.json(fail("EMAIL_NOT_VERIFIED"), { status: 403 });
      }
    }

    logAudit("login_challenge_start_failed", ip, undefined, {
      mode: "phone",
      reason: "LOGIN_CHALLENGE_START_FAILED",
    });
    console.error("Failed to start phone login challenge", error);
    return NextResponse.json(fail("LOGIN_CHALLENGE_START_FAILED"), {
      status: 500,
    });
  }
}

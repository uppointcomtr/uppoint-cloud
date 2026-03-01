import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit-log";
import { fail, ok } from "@/lib/http/response";
import { getClientIp, withRateLimit } from "@/lib/rate-limit";
import {
  RegisterVerificationChallengeError,
  startRegisterVerificationChallenge,
} from "@/modules/auth/server/register-verification-challenge";

export async function POST(request: Request) {
  // Rate limit: 5 attempts per 10 minutes per IP
  const rateLimitResponse = await withRateLimit("register-verify-restart", 5, 600);
  if (rateLimitResponse) return rateLimitResponse;

  const ip = await getClientIp();

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  try {
    const result = await startRegisterVerificationChallenge(payload);

    return NextResponse.json(ok({
      challengeId: result.challengeId,
      emailCodeExpiresAt: result.emailCodeExpiresAt.toISOString(),
    }), { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logAudit("register_verification_failed", ip, undefined, {
        step: "restart",
        reason: "VALIDATION_FAILED",
      });
      return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
    }

    if (error instanceof RegisterVerificationChallengeError) {
      const status = error.code === "USER_NOT_FOUND" ? 404 : 500;

      logAudit("register_verification_failed", ip, undefined, {
        step: "restart",
        reason: error.code,
      });
      return NextResponse.json(fail(error.code), { status });
    }

    logAudit("register_verification_failed", ip, undefined, {
      step: "restart",
      reason: "REGISTER_VERIFY_RESTART_FAILED",
    });
    console.error("Failed to restart register verification challenge", error);
    return NextResponse.json(fail("REGISTER_VERIFY_RESTART_FAILED"), { status: 500 });
  }
}

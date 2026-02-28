import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit-log";
import { fail, ok } from "@/lib/http/response";
import { getClientIp, withRateLimit } from "@/lib/rate-limit";
import {
  LoginChallengeError,
  verifyLoginChallengeCode,
} from "@/modules/auth/server/login-challenge";

export async function POST(request: Request) {
  // Rate limit: 10 attempts per 15 minutes per IP
  const rateLimitResponse = await withRateLimit("login-email-verify", 10, 900);
  if (rateLimitResponse) return rateLimitResponse;

  const ip = await getClientIp();

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  try {
    const result = await verifyLoginChallengeCode(payload, "email");

    logAudit("login_success", ip, undefined, { mode: "email" });

    return NextResponse.json(ok({ loginToken: result.loginToken }), { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
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
        logAudit("login_otp_failed", ip, undefined, { mode: "email", reason: error.code });
      }

      return NextResponse.json(fail(error.code), { status });
    }

    console.error("Failed to verify email login challenge", error);
    return NextResponse.json(fail("LOGIN_CHALLENGE_VERIFY_FAILED"), {
      status: 500,
    });
  }
}

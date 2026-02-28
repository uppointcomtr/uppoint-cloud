import { NextResponse } from "next/server";

import { logAudit } from "@/lib/audit-log";
import { fail, ok } from "@/lib/http/response";
import { getClientIp, withRateLimit } from "@/lib/rate-limit";
import {
  verifyEmailToken,
  EmailVerificationError,
} from "@/modules/auth/server/email-verification";

export async function GET(request: Request) {
  // Rate limit: 10 verification attempts per 15 minutes per IP
  const rateLimitResponse = await withRateLimit("verify-email", 10, 900);
  if (rateLimitResponse) return rateLimitResponse;

  const ip = await getClientIp();
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  try {
    await verifyEmailToken(token);
    logAudit("email_verified", ip);
    return NextResponse.json(ok({ verified: true }), { status: 200 });
  } catch (error) {
    if (error instanceof EmailVerificationError) {
      logAudit("email_verification_failed", ip, undefined, { reason: error.code });
      return NextResponse.json(fail(error.code), { status: 400 });
    }

    console.error("Email verification failed", error);
    return NextResponse.json(fail("VERIFICATION_FAILED"), { status: 500 });
  }
}

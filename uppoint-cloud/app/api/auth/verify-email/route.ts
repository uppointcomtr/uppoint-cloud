import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit-log";
import { fail, ok } from "@/lib/http/response";
import { getClientIp, withRateLimit, withRateLimitByIdentifier } from "@/lib/rate-limit";
import {
  verifyEmailToken,
  EmailVerificationError,
} from "@/modules/auth/server/email-verification";

const verifyEmailBodySchema = z.object({
  token: z.string().trim().min(1).max(512),
});

async function handleVerify(token: string, ip: string) {
  try {
    await verifyEmailToken(token);
    logAudit("email_verified", ip);
    return NextResponse.json(ok({ verified: true }), { status: 200 });
  } catch (error) {
    if (error instanceof EmailVerificationError) {
      logAudit("email_verification_failed", ip, undefined, { reason: error.code });
      return NextResponse.json(fail(error.code), { status: 400 });
    }

    logAudit("email_verification_failed", ip, undefined, { reason: "VERIFICATION_FAILED" });
    console.error("Email verification failed", error);
    return NextResponse.json(fail("VERIFICATION_FAILED"), { status: 500 });
  }
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

export async function POST(request: Request) {
  const rateLimitResponse = await withRateLimit("verify-email", 10, 900);
  if (rateLimitResponse) {
    const limitedIp = await getClientIp();
    logAudit("rate_limit_exceeded", limitedIp, undefined, {
      action: "verify-email",
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

  const parsedBody = verifyEmailBodySchema.safeParse(payload);
  if (!parsedBody.success) {
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }
  const token = parsedBody.data.token;

  const identifierRateLimit = await withRateLimitByIdentifier("verify-email-token", token, 8, 900);
  if (identifierRateLimit) {
    logAudit("rate_limit_exceeded", ip, undefined, {
      action: "verify-email",
      scope: "token",
    });
    return identifierRateLimit;
  }

  return handleVerify(token, ip);
}

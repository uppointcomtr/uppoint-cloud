import { NextResponse } from "next/server";
import { fail } from "@/lib/http/response";
import { getClientIp, withRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit-log";

export async function POST() {
  // Rate limit: 5 attempts per 10 minutes per IP
  const rateLimitResponse = await withRateLimit("forgot-password-request", 5, 600);
  if (rateLimitResponse) {
    const limitedIp = await getClientIp();
    logAudit("rate_limit_exceeded", limitedIp, undefined, {
      action: "forgot-password-request",
      scope: "ip",
    });
    return rateLimitResponse;
  }

  const ip = await getClientIp();
  logAudit("password_reset_failed", ip, undefined, {
    step: "legacy_request",
    reason: "ENDPOINT_DEPRECATED",
  });

  return NextResponse.json(
    fail("ENDPOINT_DEPRECATED"),
    { status: 410 },
  );
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

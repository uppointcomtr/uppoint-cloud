import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { fail, ok } from "@/lib/http/response";
import { withRateLimit, withRateLimitByIdentifier } from "@/lib/rate-limit";
import { verifyInternalRequestAuth } from "@/lib/security/internal-request-auth";
import { dispatchNotificationOutboxBatch } from "@/modules/notifications/server/outbox";

export async function POST(request: Request) {
  const ipRateLimitResponse = await withRateLimit("internal-notification-dispatch", 120, 60);
  if (ipRateLimitResponse) {
    return ipRateLimitResponse;
  }

  const verifiedRequest = await verifyInternalRequestAuth({
    request,
    expectedPath: "/api/internal/notifications/dispatch",
    tokenHeaderName: "x-internal-dispatch-token",
    expectedToken: env.INTERNAL_DISPATCH_TOKEN ?? "",
    signingSecret: env.INTERNAL_DISPATCH_SIGNING_SECRET ?? "",
  });

  if (!verifiedRequest) {
    return NextResponse.json(fail("UNAUTHORIZED"), { status: 401 });
  }

  if (verifiedRequest.rawBody.trim().length > 0) {
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  const requestId = request.headers.get("x-request-id")?.trim() || "unknown";
  const identifierRateLimitResponse = await withRateLimitByIdentifier(
    "internal-notification-dispatch-request",
    requestId,
    30,
    60,
  );
  if (identifierRateLimitResponse) {
    return identifierRateLimitResponse;
  }

  const result = await dispatchNotificationOutboxBatch({
    batchSize: 50,
  });

  return NextResponse.json(ok(result), { status: 200 });
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

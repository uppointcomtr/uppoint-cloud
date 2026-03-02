import { NextResponse } from "next/server";

import { logAudit } from "@/lib/audit-log";
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

  const replayRateLimitResponse = await withRateLimitByIdentifier(
    "internal-notification-dispatch-replay",
    verifiedRequest.requestId,
    1,
    300,
  );
  if (replayRateLimitResponse) {
    await logAudit("internal_dispatch_replay_blocked", "unknown", undefined, {
      requestId: verifiedRequest.requestId,
      result: "FAILURE",
      reason: "REPLAY_OR_DUPLICATE_REQUEST_ID",
    });
    return replayRateLimitResponse;
  }

  try {
    const result = await dispatchNotificationOutboxBatch({
      batchSize: 50,
    });

    await logAudit("internal_dispatch_success", "unknown", undefined, {
      requestId: verifiedRequest.requestId,
      inspected: result.inspected,
      sent: result.sent,
      failed: result.failed,
      result: "SUCCESS",
    });

    return NextResponse.json(ok(result), { status: 200 });
  } catch (error) {
    await logAudit("internal_dispatch_failed", "unknown", undefined, {
      requestId: verifiedRequest.requestId,
      result: "FAILURE",
      reason: "DISPATCH_FAILED",
    });
    console.error("Failed to dispatch notification outbox batch", error);
    return NextResponse.json(fail("DISPATCH_FAILED"), { status: 500 });
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

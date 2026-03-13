import { NextResponse } from "next/server";

import { logAudit } from "@/lib/audit-log";
import { env } from "@/lib/env";
import { fail, ok } from "@/lib/http/response";
import { withRateLimitByIdentifier } from "@/lib/rate-limit";
import { enforceInternalRouteGuard } from "@/lib/security/internal-route-guard";
import { dispatchNotificationOutboxBatch } from "@/modules/notifications/server/outbox";

export async function POST(request: Request) {
  const internalGuard = await enforceInternalRouteGuard({
    request,
    expectedPath: "/api/internal/notifications/dispatch",
    tokenHeaderName: "x-internal-dispatch-token",
    expectedToken: env.INTERNAL_DISPATCH_TOKEN ?? "",
    signingSecret: env.INTERNAL_DISPATCH_SIGNING_SECRET ?? "",
    ipRateLimit: {
      action: "internal-notification-dispatch",
      max: 120,
      windowSeconds: 60,
    },
    unauthorizedAuditAction: "internal_dispatch_unauthorized",
  });

  if (internalGuard.blockedResponse) {
    return internalGuard.blockedResponse;
  }

  const verifiedRequest = internalGuard.verifiedRequest;
  const ip = internalGuard.ip;

  if (verifiedRequest.rawBody.trim().length > 0) {
    await logAudit("internal_dispatch_failed", ip, undefined, {
      requestId: verifiedRequest.requestId,
      result: "FAILURE",
      reason: "INVALID_BODY",
    });
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  const replayRateLimitResponse = await withRateLimitByIdentifier(
    "internal-notification-dispatch-replay",
    verifiedRequest.requestId,
    1,
    300,
  );
  if (replayRateLimitResponse) {
    await logAudit("internal_dispatch_replay_blocked", ip, undefined, {
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

    await logAudit("internal_dispatch_success", ip, undefined, {
      requestId: verifiedRequest.requestId,
      inspected: result.inspected,
      sent: result.sent,
      failed: result.failed,
      result: "SUCCESS",
    });

    return NextResponse.json(ok(result), { status: 200 });
  } catch (error) {
    await logAudit("internal_dispatch_failed", ip, undefined, {
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

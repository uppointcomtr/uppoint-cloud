import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit-log";
import { env } from "@/lib/env";
import { fail, ok } from "@/lib/http/response";
import { withRateLimitByIdentifier } from "@/lib/rate-limit";
import { enforceInternalRouteGuard } from "@/lib/security/internal-route-guard";

const securityEventSchema = z.object({
  action: z.enum(["edge_host_rejected", "edge_origin_rejected"]),
  requestId: z.string().trim().min(1).max(128),
  path: z.string().trim().min(1).max(512),
  method: z.string().trim().min(1).max(16),
  host: z.string().trim().max(255).optional(),
  forwardedHost: z.string().trim().max(255).optional(),
  origin: z.string().trim().max(512).optional(),
  reason: z.string().trim().max(128).optional(),
});

export async function POST(request: Request) {
  const internalGuard = await enforceInternalRouteGuard({
    request,
    expectedPath: "/api/internal/audit/security-event",
    tokenHeaderName: "x-internal-audit-token",
    expectedToken: env.INTERNAL_AUDIT_TOKEN ?? "",
    signingSecret: env.INTERNAL_AUDIT_SIGNING_SECRET ?? "",
    ipRateLimit: {
      action: "internal-audit-security-event",
      max: 300,
      windowSeconds: 60,
    },
    unauthorizedAuditAction: "internal_audit_security_event_unauthorized",
  });

  if (internalGuard.blockedResponse) {
    return internalGuard.blockedResponse;
  }

  const verifiedRequest = internalGuard.verifiedRequest;
  const ip = internalGuard.ip;

  const replayRateLimitResponse = await withRateLimitByIdentifier(
    "internal-audit-security-event-replay",
    verifiedRequest.requestId,
    1,
    300,
  );
  if (replayRateLimitResponse) {
    await logAudit("internal_audit_security_event_replay_blocked", ip, undefined, {
      requestId: verifiedRequest.requestId,
      result: "FAILURE",
      reason: "REPLAY_OR_DUPLICATE_REQUEST_ID",
    });
    return replayRateLimitResponse;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(verifiedRequest.rawBody);
  } catch {
    await logAudit("internal_audit_security_event_invalid_body", ip, undefined, {
      requestId: verifiedRequest.requestId,
      reason: "JSON_PARSE_FAILED",
      result: "FAILURE",
    });
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  const parsed = securityEventSchema.safeParse(payload);
  if (!parsed.success) {
    await logAudit("internal_audit_security_event_invalid_body", ip, undefined, {
      requestId: verifiedRequest.requestId,
      reason: "SCHEMA_VALIDATION_FAILED",
      result: "FAILURE",
    });
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  const event = parsed.data;
  const identifierRateLimitResponse = await withRateLimitByIdentifier(
    "internal-audit-security-event-request",
    `${event.action}:${event.requestId}`,
    40,
    60,
  );
  if (identifierRateLimitResponse) {
    return identifierRateLimitResponse;
  }

  await logAudit(event.action, ip, undefined, {
    requestId: event.requestId,
    path: event.path,
    method: event.method,
    host: event.host,
    forwardedHost: event.forwardedHost,
    origin: event.origin,
    reason: event.reason,
    result: "FAILURE",
    targetId: event.host ?? event.origin ?? event.path,
  });

  return NextResponse.json(ok({ accepted: true }), { status: 202 });
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

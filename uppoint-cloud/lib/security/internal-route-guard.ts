import "server-only";

import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { fail } from "@/lib/http/response";
import { verifyInternalRequestAuth, type VerifiedInternalRequest } from "@/lib/security/internal-request-auth";
import { auditGuardFailure, enforceFailClosedIpRateLimit } from "@/lib/security/route-guard";

interface InternalRouteGuardInput {
  request: Request;
  expectedPath: string;
  tokenHeaderName: string;
  expectedToken: string;
  signingSecret: string;
  ipRateLimit: {
    action: string;
    max: number;
    windowSeconds: number;
  };
  unauthorizedAuditAction:
    | "internal_dispatch_unauthorized"
    | "internal_audit_security_event_unauthorized";
}

type InternalRouteGuardResult =
  | { ip: string; blockedResponse: Response; verifiedRequest: null }
  | { ip: string; blockedResponse: null; verifiedRequest: VerifiedInternalRequest };

export async function enforceInternalRouteGuard(
  input: InternalRouteGuardInput,
): Promise<InternalRouteGuardResult> {
  const { ip, blockedResponse } = await enforceFailClosedIpRateLimit({
    rateLimitAction: input.ipRateLimit.action,
    rateLimitMax: input.ipRateLimit.max,
    rateLimitWindowSeconds: input.ipRateLimit.windowSeconds,
    auditActionName: input.ipRateLimit.action,
    auditScope: "ip",
  });

  if (blockedResponse) {
    return { ip, blockedResponse, verifiedRequest: null };
  }

  const verifiedRequest = await verifyInternalRequestAuth({
    request: input.request,
    expectedPath: input.expectedPath,
    tokenHeaderName: input.tokenHeaderName,
    expectedToken: input.expectedToken,
    signingSecret: input.signingSecret,
    // Loopback source is mandatory only for loopback-hmac transport.
    // mTLS transport is authenticated by client cert headers + token + signature.
    requireLoopbackSource:
      env.NODE_ENV === "production"
      && env.INTERNAL_AUTH_TRANSPORT_MODE === "loopback-hmac-v1",
    transportMode: env.INTERNAL_AUTH_TRANSPORT_MODE,
  });

  if (!verifiedRequest) {
    const requestId = input.request.headers.get("x-internal-request-id")?.trim();
    await auditGuardFailure(input.unauthorizedAuditAction, ip, {
      requestId: requestId && requestId.length > 0 ? requestId.slice(0, 128) : undefined,
      reason: "INVALID_INTERNAL_REQUEST_AUTH",
    });
    return {
      ip,
      verifiedRequest: null,
      blockedResponse: NextResponse.json(fail("UNAUTHORIZED"), { status: 401 }),
    };
  }

  return { ip, blockedResponse: null, verifiedRequest };
}

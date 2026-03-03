import { NextResponse } from "next/server";

import { logAudit } from "@/lib/audit-log";
import { env } from "@/lib/env";
import { fail } from "@/lib/http/response";
import { checkRateLimit, withRateLimitByIdentifier } from "@/lib/rate-limit";
import { resolveTrustedClientIp } from "@/lib/security/client-ip";

function resolveDeprecatedRouteClientIp(request?: Request): string | null {
  if (!request) {
    return null;
  }

  return resolveTrustedClientIp({
    realIpHeader: request.headers.get("x-real-ip"),
    forwardedForHeader: request.headers.get("x-forwarded-for"),
    isProduction: env.NODE_ENV === "production",
  });
}

async function applyDeprecatedEndpointGuards(request?: Request): Promise<Response | null> {
  const clientIp = resolveDeprecatedRouteClientIp(request);
  if (env.NODE_ENV === "production" && !clientIp) {
    return NextResponse.json(
      fail("RATE_LIMIT_CONTEXT_UNAVAILABLE"),
      { status: 503 },
    );
  }

  try {
    if (clientIp) {
      const ipResult = await checkRateLimit("deprecated-forgot-password-request", clientIp, 60, 60);
      if (!ipResult.allowed) {
        const retryAfter = ipResult.retryAfterSeconds ?? 60;
        return NextResponse.json(
          fail("TOO_MANY_REQUESTS"),
          {
            status: 429,
            headers: {
              "Retry-After": String(retryAfter),
              "X-RateLimit-Limit": "60",
              "X-RateLimit-Window-Seconds": "60",
            },
          },
        );
      }
    }
  } catch {
    // Unit tests may invoke handlers outside request scope; keep deprecated contract stable.
  }

  try {
    const identifier = request?.headers.get("user-agent")?.trim() || "unknown";
    return withRateLimitByIdentifier("deprecated-forgot-password-request-agent", identifier, 120, 60);
  } catch {
    return null;
  }
}

export async function POST(request?: Request) {
  const guardResponse = await applyDeprecatedEndpointGuards(request);
  if (guardResponse) {
    const ip = resolveDeprecatedRouteClientIp(request) ?? "unknown";
    if (guardResponse.status === 429) {
      await logAudit("rate_limit_exceeded", ip, undefined, {
        action: "deprecated-forgot-password-request",
        scope: "ip_or_agent",
      });
    } else {
      await logAudit("deprecated_endpoint_access", ip, undefined, {
        endpoint: "/api/auth/forgot-password/request",
        method: "POST",
        result: "FAILURE",
        reason: "RATE_LIMIT_CONTEXT_UNAVAILABLE",
      });
    }
    return guardResponse;
  }

  const ip = resolveDeprecatedRouteClientIp(request) ?? "unknown";
  await logAudit("deprecated_endpoint_access", ip, undefined, {
    endpoint: "/api/auth/forgot-password/request",
    method: "POST",
    result: "FAILURE",
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

import { NextResponse } from "next/server";

import { logAudit } from "@/lib/audit-log";
import { fail } from "@/lib/http/response";
import { checkRateLimit, getClientIp, withRateLimitByIdentifier } from "@/lib/rate-limit";

async function applyDeprecatedEndpointGuards(request?: Request): Promise<Response | null> {
  try {
    const ip = await getClientIp();
    if (ip !== "unknown") {
      const ipResult = await checkRateLimit("deprecated-forgot-password-request", ip, 60, 60);
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
    const ip = await getClientIp().catch(() => "unknown");
    await logAudit("rate_limit_exceeded", ip, undefined, {
      action: "deprecated-forgot-password-request",
      scope: "ip_or_agent",
    });
    return guardResponse;
  }

  const ip = await getClientIp().catch(() => "unknown");
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

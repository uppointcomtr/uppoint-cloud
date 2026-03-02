import { NextResponse } from "next/server";

import { logAudit } from "@/lib/audit-log";
import { fail } from "@/lib/http/response";
import { checkRateLimit, getClientIp, withRateLimitByIdentifier } from "@/lib/rate-limit";

async function applyDeprecatedEndpointGuards(request?: Request): Promise<Response | null> {
  try {
    const ip = await getClientIp();
    if (ip !== "unknown") {
      const ipResult = await checkRateLimit("deprecated-verify-email", ip, 60, 60);
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
    return withRateLimitByIdentifier("deprecated-verify-email-agent", identifier, 120, 60);
  } catch {
    return null;
  }
}

async function deprecatedResponse(request: Request | undefined, method: "GET" | "POST") {
  const guardResponse = await applyDeprecatedEndpointGuards(request);
  if (guardResponse) {
    const ip = await getClientIp().catch(() => "unknown");
    await logAudit("rate_limit_exceeded", ip, undefined, {
      action: "deprecated-verify-email",
      scope: "ip_or_agent",
    });
    return guardResponse;
  }

  const ip = await getClientIp().catch(() => "unknown");
  await logAudit("deprecated_endpoint_access", ip, undefined, {
    endpoint: "/api/auth/verify-email",
    method,
    result: "FAILURE",
    reason: "ENDPOINT_DEPRECATED",
  });

  return NextResponse.json(
    fail("ENDPOINT_DEPRECATED"),
    { status: 410 },
  );
}

export async function GET(request?: Request) {
  return deprecatedResponse(request, "GET");
}

export async function POST(request?: Request) {
  return deprecatedResponse(request, "POST");
}

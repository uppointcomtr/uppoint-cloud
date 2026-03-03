import NextAuth from "next-auth";

import { authOptions } from "@/auth";
import { logAudit } from "@/lib/audit-log";
import { getClientIp, withRateLimit, withRateLimitByIdentifier } from "@/lib/rate-limit";

const handler = NextAuth(authOptions);

export async function GET(request: Request, context: { params: Promise<{ nextauth?: string[] }> }) {
  return handler(request, context);
}

export async function POST(request: Request, context: { params: Promise<{ nextauth?: string[] }> }) {
  const clientIp = await getClientIp();
  const ipRateLimit = await withRateLimit("nextauth-post", 30, 60);
  if (ipRateLimit) {
    await logAudit("rate_limit_exceeded", clientIp, undefined, {
      action: "nextauth-post",
      scope: "ip",
    });
    return ipRateLimit;
  }

  const actionIdentifier = context.params
    ? (await context.params).nextauth?.join("/") ?? "default"
    : "default";

  const identifierRateLimit = await withRateLimitByIdentifier(
    "nextauth-post-action",
    `${actionIdentifier}:${clientIp}`,
    120,
    60,
  );

  if (identifierRateLimit) {
    await logAudit("rate_limit_exceeded", clientIp, undefined, {
      action: "nextauth-post",
      scope: "action",
    });
    return identifierRateLimit;
  }

  return handler(request, context);
}

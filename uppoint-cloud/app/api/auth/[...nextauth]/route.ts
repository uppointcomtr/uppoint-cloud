import NextAuth from "next-auth";

import { authOptions } from "@/auth";
import { enforceFailClosedIdentifierRateLimit, enforceFailClosedIpRateLimit } from "@/lib/security/route-guard";

const handler = NextAuth(authOptions);

export async function GET(request: Request, context: { params: Promise<{ nextauth?: string[] }> }) {
  return handler(request, context);
}

export async function POST(request: Request, context: { params: Promise<{ nextauth?: string[] }> }) {
  const ipGuard = await enforceFailClosedIpRateLimit({
    rateLimitAction: "nextauth-post",
    rateLimitMax: 30,
    rateLimitWindowSeconds: 60,
    auditActionName: "nextauth-post",
    auditScope: "ip",
  });
  if (ipGuard.blockedResponse) {
    return ipGuard.blockedResponse;
  }
  const clientIp = ipGuard.ip;

  const actionIdentifier = context.params
    ? (await context.params).nextauth?.join("/") ?? "default"
    : "default";

  const identifierRateLimit = await enforceFailClosedIdentifierRateLimit({
    rateLimitAction: "nextauth-post-action",
    identifier: `${actionIdentifier}:${clientIp}`,
    rateLimitMax: 120,
    rateLimitWindowSeconds: 60,
    auditActionName: "nextauth-post",
    auditScope: "action",
    ip: clientIp,
  });

  if (identifierRateLimit) {
    return identifierRateLimit;
  }

  return handler(request, context);
}

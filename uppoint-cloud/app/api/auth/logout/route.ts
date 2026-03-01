import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit-log";
import { env } from "@/lib/env/server";
import { fail, ok } from "@/lib/http/response";
import { getClientIp, withRateLimit } from "@/lib/rate-limit";
import { revokeSessionJti } from "@/lib/session-revocation";

function usesSecureSessionCookie(request: NextRequest): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto");

  if (forwardedProto) {
    return forwardedProto.split(",")[0]?.trim() === "https";
  }

  return request.nextUrl.protocol === "https:";
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

export async function POST(request: NextRequest) {
  // Rate limit: 20 attempts per minute per IP — sufficient for multi-device logout, blocks flood.
  const rateLimitResponse = await withRateLimit("logout", 20, 60);
  if (rateLimitResponse) {
    const limitedIp = await getClientIp();
    logAudit("rate_limit_exceeded", limitedIp, undefined, { action: "logout", scope: "ip" });
    return rateLimitResponse;
  }

  const ip = await getClientIp();
  const session = await auth();
  const useSecureCookie = usesSecureSessionCookie(request);
  const token = await getToken({
    req: request,
    secret: env.AUTH_SECRET,
    secureCookie: useSecureCookie,
    cookieName: useSecureCookie
      ? "__Secure-next-auth.session-token"
      : "next-auth.session-token",
  });

  if (typeof token?.sessionJti === "string" && typeof token.exp === "number") {
    const expiresAt = new Date(token.exp * 1000);
    await revokeSessionJti({ jti: token.sessionJti, expiresAt });
    logAudit("session_revoked", ip, session?.user?.id, { reason: "logout", scope: "single-session" });
  }

  logAudit("logout_success", ip, session?.user?.id);

  return NextResponse.json(ok({ accepted: true }), { status: 200 });
}

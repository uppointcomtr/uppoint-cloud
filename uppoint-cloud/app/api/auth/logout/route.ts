import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit-log";
import { env } from "@/lib/env";
import { fail, ok } from "@/lib/http/response";
import { withIdempotency } from "@/lib/http/idempotency";
import { logServerError } from "@/lib/observability/safe-server-error-log";
import { enforceFailClosedIdentifierRateLimit, enforceFailClosedIpRateLimit } from "@/lib/security/route-guard";
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
  return withIdempotency("auth:logout", async () => {
    const ipGuard = await enforceFailClosedIpRateLimit({
      rateLimitAction: "logout",
      rateLimitMax: 20,
      rateLimitWindowSeconds: 60,
      auditActionName: "logout",
      auditScope: "ip",
    });
    if (ipGuard.blockedResponse) {
      return ipGuard.blockedResponse;
    }
    const ip = ipGuard.ip;
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

    const rateLimitIdentifier = typeof token?.sessionJti === "string"
      ? token.sessionJti
      : (session?.user?.id ?? "anonymous");

    const identifierRateLimit = await enforceFailClosedIdentifierRateLimit({
      rateLimitAction: "logout-session",
      identifier: rateLimitIdentifier,
      rateLimitMax: 30,
      rateLimitWindowSeconds: 60,
      auditActionName: "logout",
      auditScope: "session",
      ip,
      userId: session?.user?.id,
    });
    if (identifierRateLimit) {
      return identifierRateLimit;
    }

    const sessionJti = typeof token?.sessionJti === "string" ? token.sessionJti : null;
    const tokenExp = typeof token?.exp === "number" ? token.exp : null;
    const hasSessionJti = sessionJti !== null && tokenExp !== null;

    if (session?.user?.id && !hasSessionJti) {
      await logAudit("logout_failed", ip, session.user.id, {
        reason: "REVOCABLE_SESSION_MISSING",
        result: "FAILURE",
        scope: "single-session",
      });
      return NextResponse.json(fail("LOGOUT_SESSION_INVALID"), { status: 409 });
    }

    if (hasSessionJti) {
      try {
        const expiresAt = new Date(tokenExp * 1000);
        await revokeSessionJti({ jti: sessionJti, expiresAt });
      } catch (error) {
        await logAudit("logout_failed", ip, session?.user?.id, {
          reason: "SESSION_REVOCATION_FAILED",
          result: "FAILURE",
          scope: "single-session",
        });
        logServerError("logout_revocation_failed", error, {
          route: "/api/auth/logout",
          userId: session?.user?.id,
        });
        return NextResponse.json(fail("LOGOUT_REVOCATION_FAILED"), { status: 500 });
      }
    }

    await logAudit("logout_success", ip, session?.user?.id, {
      scope: "single-session",
      tokenRevoked: hasSessionJti,
    });

    return NextResponse.json(ok({ accepted: true }), { status: 200 });
  });
}

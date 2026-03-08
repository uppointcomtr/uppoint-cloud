import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { fail, ok } from "@/lib/http/response";
import { withIdempotency } from "@/lib/http/idempotency";
import { enforceFailClosedIdentifierRateLimit, enforceFailClosedIpRateLimit } from "@/lib/security/route-guard";
import { revokeAllSessionsForUser } from "@/modules/auth/server/session-security";

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

export async function POST() {
  return withIdempotency("auth:logout-all", async () => {
    const ipGuard = await enforceFailClosedIpRateLimit({
      rateLimitAction: "logout-all",
      rateLimitMax: 10,
      rateLimitWindowSeconds: 60,
      auditActionName: "logout-all",
      auditScope: "ip",
    });
    if (ipGuard.blockedResponse) {
      return ipGuard.blockedResponse;
    }
    const ip = ipGuard.ip;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(fail("UNAUTHORIZED"), { status: 401 });
    }

    const identifierRateLimit = await enforceFailClosedIdentifierRateLimit({
      rateLimitAction: "logout-all-user",
      identifier: session.user.id,
      rateLimitMax: 10,
      rateLimitWindowSeconds: 60,
      auditActionName: "logout-all",
      auditScope: "user",
      ip,
      userId: session.user.id,
    });
    if (identifierRateLimit) {
      return identifierRateLimit;
    }

    const revoked = await revokeAllSessionsForUser({
      userId: session.user.id,
      ip,
    });

    if (!revoked) {
      return NextResponse.json(fail("LOGOUT_ALL_FAILED"), { status: 400 });
    }

    return NextResponse.json(ok({ accepted: true }), { status: 200 });
  });
}

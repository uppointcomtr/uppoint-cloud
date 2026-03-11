import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit-log";
import { withIdempotency } from "@/lib/http/idempotency";
import { fail, ok } from "@/lib/http/response";
import { enforceFailClosedIdentifierRateLimit, enforceFailClosedIpRateLimit } from "@/lib/security/route-guard";
import { AccountProfileError, updateAccountProfileName } from "@/modules/auth/server/account-profile";

function resolveProfileUpdateStatus(code: AccountProfileError["code"]): number {
  switch (code) {
    case "NAME_UNCHANGED":
      return 400;
    case "PROFILE_NOT_FOUND":
      return 404;
    default:
      return 500;
  }
}

export async function PATCH(request: Request) {
  return withIdempotency("auth:account-profile-update", async () => {
    const ipGuard = await enforceFailClosedIpRateLimit({
      rateLimitAction: "account-profile-update",
      rateLimitMax: 10,
      rateLimitWindowSeconds: 600,
      auditActionName: "account-profile-update",
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

    const userRateLimit = await enforceFailClosedIdentifierRateLimit({
      rateLimitAction: "account-profile-update-user",
      identifier: session.user.id,
      rateLimitMax: 10,
      rateLimitWindowSeconds: 600,
      auditActionName: "account-profile-update",
      auditScope: "user",
      ip,
      userId: session.user.id,
    });
    if (userRateLimit) {
      return userRateLimit;
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
    }

    try {
      const result = await updateAccountProfileName({
        ...(payload as Record<string, unknown>),
        userId: session.user.id,
      });

      await logAudit("profile_updated", ip, session.user.id, {
        result: "SUCCESS",
        scope: "name",
      });

      return NextResponse.json(ok({
        name: result.name,
        email: result.email,
      }), { status: 200 });
    } catch (error) {
      if (error instanceof z.ZodError) {
        await logAudit("profile_update_failed", ip, session.user.id, {
          reason: "VALIDATION_FAILED",
          result: "FAILURE",
        });
        return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
      }

      if (error instanceof AccountProfileError) {
        await logAudit("profile_update_failed", ip, session.user.id, {
          reason: error.code,
          result: "FAILURE",
        });
        return NextResponse.json(fail(error.code), {
          status: resolveProfileUpdateStatus(error.code),
        });
      }

      await logAudit("profile_update_failed", ip, session.user.id, {
        reason: "PROFILE_UPDATE_FAILED",
        result: "FAILURE",
      });
      console.error("Failed to update account profile name", error);
      return NextResponse.json(fail("PROFILE_UPDATE_FAILED"), { status: 500 });
    }
  });
}

export async function GET() {
  return NextResponse.json(
    fail("METHOD_NOT_ALLOWED"),
    {
      status: 405,
      headers: {
        Allow: "PATCH",
      },
    },
  );
}

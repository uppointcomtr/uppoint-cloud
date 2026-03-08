import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { fail, ok } from "@/lib/http/response";
import { withIdempotency } from "@/lib/http/idempotency";
import { enforceFailClosedIdentifierRateLimit, enforceFailClosedIpRateLimit } from "@/lib/security/route-guard";
import { softDeleteUser } from "@/modules/auth/server/user-lifecycle";

const deleteAccountSchema = z.object({
  confirmText: z.string().trim().min(1).max(64),
});

const DELETE_CONFIRM_TEXT = "DELETE";

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

export async function POST(request: Request) {
  return withIdempotency("auth:account-delete", async () => {
    const ipGuard = await enforceFailClosedIpRateLimit({
      rateLimitAction: "account-delete",
      rateLimitMax: 4,
      rateLimitWindowSeconds: 60 * 10,
      auditActionName: "account-delete",
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
      rateLimitAction: "account-delete-user",
      identifier: session.user.id,
      rateLimitMax: 4,
      rateLimitWindowSeconds: 60 * 10,
      auditActionName: "account-delete",
      auditScope: "user",
      ip,
      userId: session.user.id,
    });
    if (identifierRateLimit) {
      return identifierRateLimit;
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
    }

    const parsed = deleteAccountSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
    }

    if (parsed.data.confirmText !== DELETE_CONFIRM_TEXT) {
      return NextResponse.json(fail("DELETE_CONFIRMATION_REQUIRED"), { status: 400 });
    }

    const deleted = await softDeleteUser(session.user.id, undefined, { ip });
    if (!deleted) {
      return NextResponse.json(fail("ACCOUNT_DELETE_FAILED"), { status: 400 });
    }

    return NextResponse.json(ok({ accepted: true }), { status: 200 });
  });
}

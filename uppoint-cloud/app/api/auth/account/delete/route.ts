import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit-log";
import { fail, ok } from "@/lib/http/response";
import { withIdempotency } from "@/lib/http/idempotency";
import { logServerError } from "@/lib/observability/safe-server-error-log";
import { enforceFailClosedIdentifierRateLimit, enforceFailClosedIpRateLimit } from "@/lib/security/route-guard";
import { logAuthInvalidBody } from "@/modules/auth/server/route-audit";
import {
  AccountDeleteChallengeError,
  completeAccountDeleteChallenge,
} from "@/modules/auth/server/account-delete-challenge";

const deleteAccountSchema = z.object({
  challengeId: z.string().trim().min(1).max(191),
  deleteToken: z.string().trim().min(32).max(512),
});

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
      await logAuthInvalidBody({
        action: "account_delete_challenge_failed",
        ip,
        userId: session.user.id,
        metadata: { step: "complete" },
      });
      return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
    }

    const parsed = deleteAccountSchema.safeParse(payload);
    if (!parsed.success) {
      await logAudit("account_delete_challenge_failed", ip, session.user.id, {
        step: "complete",
        reason: "VALIDATION_FAILED",
      });
      return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
    }

    const challengeRateLimit = await enforceFailClosedIdentifierRateLimit({
      rateLimitAction: "account-delete-complete-challenge",
      identifier: parsed.data.challengeId,
      rateLimitMax: 6,
      rateLimitWindowSeconds: 900,
      auditActionName: "account-delete-complete",
      auditScope: "challenge",
      ip,
      userId: session.user.id,
    });
    if (challengeRateLimit) {
      return challengeRateLimit;
    }

    try {
      const completion = await completeAccountDeleteChallenge({
        challengeId: parsed.data.challengeId,
        deleteToken: parsed.data.deleteToken,
        userId: session.user.id,
      });

      await logAudit("account_delete_success", ip, completion.userId, {
        step: "complete",
        result: "SUCCESS",
      });
    } catch (error) {
      if (error instanceof AccountDeleteChallengeError) {
        const status =
          error.code === "INVALID_OR_EXPIRED_DELETE_TOKEN" ||
          error.code === "DELETE_TOKEN_NOT_READY" ||
          error.code === "INVALID_OR_EXPIRED_CHALLENGE"
            ? 400
            : 500;

        await logAudit("account_delete_challenge_failed", ip, session.user.id, {
          step: "complete",
          reason: error.code,
        });

        return NextResponse.json(fail(error.code), { status });
      }

      await logAudit("account_delete_challenge_failed", ip, session.user.id, {
        step: "complete",
        reason: "ACCOUNT_DELETE_COMPLETE_FAILED",
      });
      logServerError("account_delete_complete_failed", error, {
        route: "/api/auth/account/delete",
        challengeId: parsed.data.challengeId,
        userId: session.user.id,
      });
      return NextResponse.json(fail("ACCOUNT_DELETE_COMPLETE_FAILED"), { status: 500 });
    }

    return NextResponse.json(ok({ accepted: true }), { status: 200 });
  });
}

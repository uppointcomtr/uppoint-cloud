import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit-log";
import { withIdempotency } from "@/lib/http/idempotency";
import { fail, ok } from "@/lib/http/response";
import { enforceFailClosedIdentifierRateLimit, enforceFailClosedIpRateLimit } from "@/lib/security/route-guard";
import {
  AccountDeleteChallengeError,
  startAccountDeleteChallenge,
} from "@/modules/auth/server/account-delete-challenge";

export async function POST(request: Request) {
  return withIdempotency("auth:account-delete-challenge-start", async () => {
    const ipGuard = await enforceFailClosedIpRateLimit({
      rateLimitAction: "account-delete-challenge-start",
      rateLimitMax: 5,
      rateLimitWindowSeconds: 600,
      auditActionName: "account-delete-challenge-start",
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
      rateLimitAction: "account-delete-challenge-start-user",
      identifier: session.user.id,
      rateLimitMax: 5,
      rateLimitWindowSeconds: 600,
      auditActionName: "account-delete-challenge-start",
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

    try {
      const result = await startAccountDeleteChallenge({
        ...(payload as Record<string, unknown>),
        userId: session.user.id,
      });

      await logAudit("account_delete_challenge_started", ip, session.user.id, {
        step: "start",
        challengeId: result.challengeId,
        result: "SUCCESS",
      });

      return NextResponse.json(
        ok({
          challengeId: result.challengeId,
          emailCodeExpiresAt: result.emailCodeExpiresAt.toISOString(),
        }),
        { status: 200 },
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        await logAudit("account_delete_challenge_failed", ip, session.user.id, {
          step: "start",
          reason: "VALIDATION_FAILED",
        });
        return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
      }

      if (error instanceof AccountDeleteChallengeError) {
        await logAudit("account_delete_challenge_failed", ip, session.user.id, {
          step: "start",
          reason: error.code,
        });

        const status =
          error.code === "PHONE_NOT_AVAILABLE" || error.code === "SMS_NOT_ENABLED"
            ? 400
            : 500;
        return NextResponse.json(fail(error.code), { status });
      }

      await logAudit("account_delete_challenge_failed", ip, session.user.id, {
        step: "start",
        reason: "ACCOUNT_DELETE_CHALLENGE_START_FAILED",
      });
      console.error("Failed to start account-delete challenge", error);
      return NextResponse.json(fail("ACCOUNT_DELETE_CHALLENGE_START_FAILED"), { status: 500 });
    }
  });
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

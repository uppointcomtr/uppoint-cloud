import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit-log";
import { withIdempotency } from "@/lib/http/idempotency";
import { fail, ok } from "@/lib/http/response";
import { enforceFailClosedIdentifierRateLimit, enforceFailClosedIpRateLimit } from "@/lib/security/route-guard";
import { logAuthInvalidBody } from "@/modules/auth/server/route-audit";
import {
  AccountDeleteChallengeError,
  verifyAccountDeleteSmsCode,
} from "@/modules/auth/server/account-delete-challenge";

export async function POST(request: Request) {
  return withIdempotency("auth:account-delete-verify-sms", async () => {
    const ipGuard = await enforceFailClosedIpRateLimit({
      rateLimitAction: "account-delete-verify-sms",
      rateLimitMax: 10,
      rateLimitWindowSeconds: 900,
      auditActionName: "account-delete-verify-sms",
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

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      await logAuthInvalidBody({
        action: "account_delete_challenge_failed",
        ip,
        userId: session.user.id,
        metadata: { step: "verify_sms" },
      });
      return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
    }

    const rawPayload = payload as Record<string, unknown>;
    const challengeId = typeof rawPayload.challengeId === "string" ? rawPayload.challengeId.trim() : "";

    if (challengeId) {
      const challengeRateLimit = await enforceFailClosedIdentifierRateLimit({
        rateLimitAction: "account-delete-verify-sms-challenge",
        identifier: challengeId,
        rateLimitMax: 8,
        rateLimitWindowSeconds: 900,
        auditActionName: "account-delete-verify-sms",
        auditScope: "challenge",
        ip,
        userId: session.user.id,
      });
      if (challengeRateLimit) {
        return challengeRateLimit;
      }
    }

    const userRateLimit = await enforceFailClosedIdentifierRateLimit({
      rateLimitAction: "account-delete-verify-sms-user",
      identifier: session.user.id,
      rateLimitMax: 10,
      rateLimitWindowSeconds: 900,
      auditActionName: "account-delete-verify-sms",
      auditScope: "user",
      ip,
      userId: session.user.id,
    });
    if (userRateLimit) {
      return userRateLimit;
    }

    try {
      const result = await verifyAccountDeleteSmsCode({
        ...rawPayload,
        userId: session.user.id,
      });

      await logAudit("account_delete_sms_verified", ip, session.user.id, {
        step: "verify_sms",
        challengeId,
        result: "SUCCESS",
      });

      return NextResponse.json(
        ok({
          deleteToken: result.deleteToken,
        }),
        { status: 200 },
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        await logAudit("account_delete_challenge_failed", ip, session.user.id, {
          step: "verify_sms",
          reason: "VALIDATION_FAILED",
        });
        return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
      }

      if (error instanceof AccountDeleteChallengeError) {
        const neutralizedChallengeCode =
          error.code === "INVALID_OR_EXPIRED_CHALLENGE" || error.code === "INVALID_SMS_CODE";

        await logAudit("account_delete_challenge_failed", ip, session.user.id, {
          step: "verify_sms",
          reason: neutralizedChallengeCode ? "VERIFICATION_CODE_REJECTED" : error.code,
        });

        const status =
          neutralizedChallengeCode || error.code === "MAX_ATTEMPTS_REACHED"
            ? 400
            : 500;

        return NextResponse.json(
          fail(neutralizedChallengeCode ? "INVALID_OR_EXPIRED_CHALLENGE" : error.code),
          { status },
        );
      }

      await logAudit("account_delete_challenge_failed", ip, session.user.id, {
        step: "verify_sms",
        reason: "ACCOUNT_DELETE_VERIFY_SMS_FAILED",
      });
      console.error("Failed to verify account-delete SMS code", error);
      return NextResponse.json(fail("ACCOUNT_DELETE_VERIFY_SMS_FAILED"), { status: 500 });
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

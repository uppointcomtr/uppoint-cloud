import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit-log";
import { withIdempotency } from "@/lib/http/idempotency";
import { fail, ok } from "@/lib/http/response";
import { enforceFailClosedIdentifierRateLimit, enforceFailClosedIpRateLimit } from "@/lib/security/route-guard";
import { AccountProfileError, verifyAccountContactChangeSmsCode } from "@/modules/auth/server/account-profile";

function resolveVerifySmsStatus(code: AccountProfileError["code"]): number {
  switch (code) {
    case "INVALID_OR_EXPIRED_CHALLENGE":
    case "INVALID_SMS_CODE":
    case "MAX_ATTEMPTS_REACHED":
    case "CHANGE_TOKEN_NOT_READY":
      return 400;
    default:
      return 500;
  }
}

export async function POST(request: Request) {
  return withIdempotency("auth:account-contact-change-verify-sms", async () => {
    const ipGuard = await enforceFailClosedIpRateLimit({
      rateLimitAction: "account-contact-change-verify-sms",
      rateLimitMax: 10,
      rateLimitWindowSeconds: 900,
      auditActionName: "account-contact-change-verify-sms",
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
      return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
    }

    const rawPayload = payload as Record<string, unknown>;
    const challengeId = typeof rawPayload.challengeId === "string" ? rawPayload.challengeId.trim() : "";

    if (challengeId) {
      const challengeRateLimit = await enforceFailClosedIdentifierRateLimit({
        rateLimitAction: "account-contact-change-verify-sms-challenge",
        identifier: challengeId,
        rateLimitMax: 8,
        rateLimitWindowSeconds: 900,
        auditActionName: "account-contact-change-verify-sms",
        auditScope: "challenge",
        ip,
        userId: session.user.id,
      });
      if (challengeRateLimit) {
        return challengeRateLimit;
      }
    }

    const userRateLimit = await enforceFailClosedIdentifierRateLimit({
      rateLimitAction: "account-contact-change-verify-sms-user",
      identifier: session.user.id,
      rateLimitMax: 10,
      rateLimitWindowSeconds: 900,
      auditActionName: "account-contact-change-verify-sms",
      auditScope: "user",
      ip,
      userId: session.user.id,
    });
    if (userRateLimit) {
      return userRateLimit;
    }

    try {
      const result = await verifyAccountContactChangeSmsCode({
        ...rawPayload,
        userId: session.user.id,
      });

      await logAudit("account_contact_change_sms_verified", ip, session.user.id, {
        result: "SUCCESS",
        step: "verify_sms",
        type: result.type,
        challengeId,
      });

      return NextResponse.json(ok({
        changeToken: result.changeToken,
        type: result.type,
      }), { status: 200 });
    } catch (error) {
      if (error instanceof z.ZodError) {
        await logAudit("account_contact_change_failed", ip, session.user.id, {
          reason: "VALIDATION_FAILED",
          result: "FAILURE",
          step: "verify_sms",
        });
        return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
      }

      if (error instanceof AccountProfileError) {
        const neutralizedChallengeCode =
          error.code === "INVALID_OR_EXPIRED_CHALLENGE" || error.code === "INVALID_SMS_CODE";

        await logAudit("account_contact_change_failed", ip, session.user.id, {
          reason: neutralizedChallengeCode ? "VERIFICATION_CODE_REJECTED" : error.code,
          result: "FAILURE",
          step: "verify_sms",
        });

        return NextResponse.json(
          fail(neutralizedChallengeCode ? "INVALID_OR_EXPIRED_CHALLENGE" : error.code),
          { status: resolveVerifySmsStatus(error.code) },
        );
      }

      await logAudit("account_contact_change_failed", ip, session.user.id, {
        reason: "ACCOUNT_CONTACT_CHANGE_VERIFY_SMS_FAILED",
        result: "FAILURE",
        step: "verify_sms",
      });
      console.error("Failed to verify account contact change SMS code", error);
      return NextResponse.json(fail("ACCOUNT_CONTACT_CHANGE_VERIFY_SMS_FAILED"), { status: 500 });
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

import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit-log";
import { withIdempotency } from "@/lib/http/idempotency";
import { fail, ok } from "@/lib/http/response";
import { enforceFailClosedIdentifierRateLimit, enforceFailClosedIpRateLimit } from "@/lib/security/route-guard";
import { AccountProfileError, completeAccountContactChangeChallenge } from "@/modules/auth/server/account-profile";

function resolveCompleteStatus(code: AccountProfileError["code"]): number {
  switch (code) {
    case "INVALID_OR_EXPIRED_CHALLENGE":
    case "INVALID_OR_EXPIRED_CHANGE_TOKEN":
    case "CHANGE_TOKEN_NOT_READY":
    case "EMAIL_TAKEN":
    case "PHONE_TAKEN":
      return 400;
    default:
      return 500;
  }
}

export async function POST(request: Request) {
  return withIdempotency("auth:account-contact-change-complete", async () => {
    const ipGuard = await enforceFailClosedIpRateLimit({
      rateLimitAction: "account-contact-change-complete",
      rateLimitMax: 10,
      rateLimitWindowSeconds: 900,
      auditActionName: "account-contact-change-complete",
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
        rateLimitAction: "account-contact-change-complete-challenge",
        identifier: challengeId,
        rateLimitMax: 8,
        rateLimitWindowSeconds: 900,
        auditActionName: "account-contact-change-complete",
        auditScope: "challenge",
        ip,
        userId: session.user.id,
      });
      if (challengeRateLimit) {
        return challengeRateLimit;
      }
    }

    const userRateLimit = await enforceFailClosedIdentifierRateLimit({
      rateLimitAction: "account-contact-change-complete-user",
      identifier: session.user.id,
      rateLimitMax: 10,
      rateLimitWindowSeconds: 900,
      auditActionName: "account-contact-change-complete",
      auditScope: "user",
      ip,
      userId: session.user.id,
    });
    if (userRateLimit) {
      return userRateLimit;
    }

    try {
      const result = await completeAccountContactChangeChallenge({
        ...rawPayload,
        userId: session.user.id,
      });

      await logAudit("account_contact_change_completed", ip, session.user.id, {
        result: "SUCCESS",
        step: "complete",
        type: result.type,
        challengeId,
      });

      return NextResponse.json(ok({
        type: result.type,
        updatedValue: result.updatedValue,
      }), { status: 200 });
    } catch (error) {
      if (error instanceof z.ZodError) {
        await logAudit("account_contact_change_failed", ip, session.user.id, {
          reason: "VALIDATION_FAILED",
          result: "FAILURE",
          step: "complete",
        });
        return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
      }

      if (error instanceof AccountProfileError) {
        await logAudit("account_contact_change_failed", ip, session.user.id, {
          reason: error.code,
          result: "FAILURE",
          step: "complete",
        });
        return NextResponse.json(fail(error.code), {
          status: resolveCompleteStatus(error.code),
        });
      }

      await logAudit("account_contact_change_failed", ip, session.user.id, {
        reason: "ACCOUNT_CONTACT_CHANGE_COMPLETE_FAILED",
        result: "FAILURE",
        step: "complete",
      });
      console.error("Failed to complete account contact change", error);
      return NextResponse.json(fail("ACCOUNT_CONTACT_CHANGE_COMPLETE_FAILED"), { status: 500 });
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

import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit-log";
import { withIdempotency } from "@/lib/http/idempotency";
import { fail, ok } from "@/lib/http/response";
import { enforceFailClosedIdentifierRateLimit, enforceFailClosedIpRateLimit } from "@/lib/security/route-guard";
import { AccountProfileError, startAccountContactChangeChallenge } from "@/modules/auth/server/account-profile";

function resolveStartStatus(code: AccountProfileError["code"]): number {
  switch (code) {
    case "EMAIL_UNCHANGED":
    case "PHONE_UNCHANGED":
    case "EMAIL_TAKEN":
    case "PHONE_TAKEN":
    case "PHONE_NOT_AVAILABLE":
    case "PHONE_VERIFICATION_REQUIRED":
    case "EMAIL_VERIFICATION_REQUIRED":
    case "SMS_NOT_ENABLED":
      return 400;
    case "PROFILE_NOT_FOUND":
      return 404;
    default:
      return 500;
  }
}

export async function POST(request: Request) {
  return withIdempotency("auth:account-contact-change-start", async () => {
    const ipGuard = await enforceFailClosedIpRateLimit({
      rateLimitAction: "account-contact-change-start",
      rateLimitMax: 6,
      rateLimitWindowSeconds: 600,
      auditActionName: "account-contact-change-start",
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
    const targetIdentifier =
      typeof rawPayload.nextEmail === "string"
        ? rawPayload.nextEmail.trim().toLowerCase()
        : typeof rawPayload.nextPhone === "string"
          ? rawPayload.nextPhone.trim()
          : "";

    const userRateLimit = await enforceFailClosedIdentifierRateLimit({
      rateLimitAction: "account-contact-change-start-user",
      identifier: session.user.id,
      rateLimitMax: 6,
      rateLimitWindowSeconds: 600,
      auditActionName: "account-contact-change-start",
      auditScope: "user",
      ip,
      userId: session.user.id,
    });
    if (userRateLimit) {
      return userRateLimit;
    }

    if (targetIdentifier) {
      const targetRateLimit = await enforceFailClosedIdentifierRateLimit({
        rateLimitAction: "account-contact-change-start-target",
        identifier: targetIdentifier,
        rateLimitMax: 6,
        rateLimitWindowSeconds: 600,
        auditActionName: "account-contact-change-start",
        auditScope: "target",
        ip,
        userId: session.user.id,
      });
      if (targetRateLimit) {
        return targetRateLimit;
      }
    }

    try {
      const result = await startAccountContactChangeChallenge({
        ...rawPayload,
        userId: session.user.id,
      });

      await logAudit("account_contact_change_started", ip, session.user.id, {
        result: "SUCCESS",
        type: result.type,
        challengeId: result.challengeId,
      });

      return NextResponse.json(ok({
        challengeId: result.challengeId,
        emailCodeExpiresAt: result.emailCodeExpiresAt.toISOString(),
        type: result.type,
        maskedEmail: result.maskedEmail,
      }), { status: 200 });
    } catch (error) {
      if (error instanceof z.ZodError) {
        await logAudit("account_contact_change_failed", ip, session.user.id, {
          reason: "VALIDATION_FAILED",
          result: "FAILURE",
          step: "start",
        });
        return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
      }

      if (error instanceof AccountProfileError) {
        await logAudit("account_contact_change_failed", ip, session.user.id, {
          reason: error.code,
          result: "FAILURE",
          step: "start",
        });
        return NextResponse.json(fail(error.code), {
          status: resolveStartStatus(error.code),
        });
      }

      await logAudit("account_contact_change_failed", ip, session.user.id, {
        reason: "ACCOUNT_CONTACT_CHANGE_START_FAILED",
        result: "FAILURE",
        step: "start",
      });
      console.error("Failed to start account contact change", error);
      return NextResponse.json(fail("ACCOUNT_CONTACT_CHANGE_START_FAILED"), { status: 500 });
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

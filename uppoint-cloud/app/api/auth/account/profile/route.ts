import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit-log";
import { withIdempotency } from "@/lib/http/idempotency";
import { fail, ok } from "@/lib/http/response";
import { logServerError } from "@/lib/observability/safe-server-error-log";
import { enforceFailClosedIdentifierRateLimit, enforceFailClosedIpRateLimit } from "@/lib/security/route-guard";
import {
  AccountProfileError,
  startAccountProfileNameUpdateChallenge,
  verifyAccountProfileNameUpdateChallenge,
} from "@/modules/auth/server/account-profile";
import { logAuthInvalidBody } from "@/modules/auth/server/route-audit";

function resolveProfileUpdateStatus(code: AccountProfileError["code"]): number {
  switch (code) {
    case "NAME_UNCHANGED":
    case "INVALID_OR_EXPIRED_CHALLENGE":
    case "INVALID_EMAIL_CODE":
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
      await logAuthInvalidBody({
        action: "profile_update_failed",
        ip,
        userId: session.user.id,
        metadata: { step: "unknown" },
      });
      return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
    }

    const rawPayload = payload as Record<string, unknown>;
    const verificationStep = rawPayload.verificationStep === "verify" ? "verify" : "start";

    try {
      if (verificationStep === "start") {
        const challenge = await startAccountProfileNameUpdateChallenge({
          ...rawPayload,
          userId: session.user.id,
        });

        await logAudit("profile_update_verification_sent", ip, session.user.id, {
          result: "SUCCESS",
          scope: "name",
          destination: challenge.maskedEmail,
        });

        return NextResponse.json(ok({
          verificationRequired: true,
          draftToken: challenge.draftToken,
          maskedEmail: challenge.maskedEmail,
          emailCodeExpiresAt: challenge.emailCodeExpiresAt.toISOString(),
        }), { status: 200 });
      }

      const result = await verifyAccountProfileNameUpdateChallenge({
        ...rawPayload,
        userId: session.user.id,
      });

      await logAudit("profile_updated", ip, session.user.id, {
        result: "SUCCESS",
        scope: "name",
      });

      return NextResponse.json(ok({
        verificationRequired: false,
        name: result.name,
        email: result.email,
      }), { status: 200 });
    } catch (error) {
      if (error instanceof z.ZodError) {
        await logAudit("profile_update_failed", ip, session.user.id, {
          reason: "VALIDATION_FAILED",
          result: "FAILURE",
          step: verificationStep,
        });
        return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
      }

      if (error instanceof AccountProfileError) {
        await logAudit("profile_update_failed", ip, session.user.id, {
          reason: error.code,
          result: "FAILURE",
          step: verificationStep,
        });
        const isNeutralizedChallengeError = error.code === "INVALID_EMAIL_CODE";
        return NextResponse.json(fail(isNeutralizedChallengeError ? "INVALID_OR_EXPIRED_CHALLENGE" : error.code), {
          status: resolveProfileUpdateStatus(error.code),
        });
      }

      await logAudit("profile_update_failed", ip, session.user.id, {
        reason:
          verificationStep === "start"
            ? "PROFILE_UPDATE_VERIFICATION_SEND_FAILED"
            : "PROFILE_UPDATE_FAILED",
        result: "FAILURE",
        step: verificationStep,
      });
      logServerError("account_profile_name_update_failed", error, {
        route: "/api/auth/account/profile",
        verificationStep,
        userId: session.user.id,
      });
      return NextResponse.json(
        fail(
          verificationStep === "start"
            ? "PROFILE_UPDATE_VERIFICATION_SEND_FAILED"
            : "PROFILE_UPDATE_FAILED",
        ),
        { status: 500 },
      );
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

import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit-log";
import { withIdempotency } from "@/lib/http/idempotency";
import { fail, ok } from "@/lib/http/response";
import { enforceFailClosedIdentifierRateLimit, enforceFailClosedIpRateLimit } from "@/lib/security/route-guard";
import {
  RegisterVerificationChallengeError,
  REGISTER_CODE_TTL_MINUTES,
  startRegisterVerificationChallenge,
} from "@/modules/auth/server/register-verification-challenge";
import { generateOpaqueChallengeId, getOpaqueChallengeExpiresAt } from "@/modules/auth/server/opaque-challenge";

function normalizePhoneForRateLimit(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const digits = value.replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  return `+${digits}`;
}

export async function POST(request: Request) {
  return withIdempotency("auth:register", async () => {
  const ipGuard = await enforceFailClosedIpRateLimit({
    rateLimitAction: "register",
    rateLimitMax: 5,
    rateLimitWindowSeconds: 600,
    auditActionName: "register",
    auditScope: "ip",
  });
  if (ipGuard.blockedResponse) {
    return ipGuard.blockedResponse;
  }
  const ip = ipGuard.ip;

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(fail("INVALID_BODY"), {
      status: 400,
    });
  }

  const rawPayload = payload as Record<string, unknown>;
  const normalizedEmail = typeof rawPayload.email === "string" ? rawPayload.email.trim().toLowerCase() : null;
  const normalizedPhone = normalizePhoneForRateLimit(
    typeof rawPayload.phone === "string" ? rawPayload.phone.trim() : null,
  );

  if (normalizedEmail) {
    const identifierRateLimit = await enforceFailClosedIdentifierRateLimit({
      rateLimitAction: "register-email",
      identifier: normalizedEmail,
      rateLimitMax: 3,
      rateLimitWindowSeconds: 600,
      auditActionName: "register",
      auditScope: "email",
      ip,
    });
    if (identifierRateLimit) {
      return identifierRateLimit;
    }
  }

  if (normalizedPhone) {
    const phoneIdentifierRateLimit = await enforceFailClosedIdentifierRateLimit({
      rateLimitAction: "register-phone",
      identifier: normalizedPhone,
      rateLimitMax: 3,
      rateLimitWindowSeconds: 600,
      auditActionName: "register",
      auditScope: "phone",
      ip,
    });
    if (phoneIdentifierRateLimit) {
      return phoneIdentifierRateLimit;
    }
  }

  try {
    const challenge = await startRegisterVerificationChallenge(payload);

    await logAudit("register_success", ip, undefined, {
      step: "challenge_started",
    });

    return NextResponse.json(ok({
      accepted: true,
      hasChallenge: true,
      challengeId: challenge.challengeId,
      emailCodeExpiresAt: challenge.emailCodeExpiresAt.toISOString(),
    }), {
      status: 201,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      await logAudit("register_verification_failed", ip, undefined, {
        step: "start",
        reason: "VALIDATION_FAILED",
      });
      return NextResponse.json(fail("VALIDATION_FAILED"), {
        status: 400,
      });
    }

    if (error instanceof RegisterVerificationChallengeError && error.code === "EMAIL_TAKEN") {
      await logAudit("register_verification_failed", ip, undefined, {
        step: "start",
        reason: "ACCOUNT_HIDDEN",
      });
      // Security-sensitive: return the same shape as successful challenge creation.
      const decoyChallengeId = generateOpaqueChallengeId();
      const decoyExpiresAt = getOpaqueChallengeExpiresAt(REGISTER_CODE_TTL_MINUTES);
      return NextResponse.json(ok({
        accepted: true,
        hasChallenge: true,
        challengeId: decoyChallengeId,
        emailCodeExpiresAt: decoyExpiresAt.toISOString(),
      }), {
        status: 201,
      });
    }

    if (error instanceof RegisterVerificationChallengeError) {
      await logAudit("register_verification_failed", ip, undefined, {
        step: "start",
        reason: error.code,
      });
      return NextResponse.json(fail("REGISTER_VERIFICATION_START_FAILED"), {
        status: 500,
      });
    }

    await logAudit("register_verification_failed", ip, undefined, {
      step: "start",
      reason: "REGISTER_VERIFICATION_START_FAILED",
    });
    console.error("Failed to register user", error);
    return NextResponse.json(fail("REGISTER_VERIFICATION_START_FAILED"), {
      status: 500,
    });
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

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/db/client";
import { logAudit } from "@/lib/audit-log";
import { fail, ok } from "@/lib/http/response";
import { getClientIp, withRateLimit } from "@/lib/rate-limit";
import {
  registerUser,
  RegisterUserError,
} from "@/modules/auth/server/register-user";
import {
  RegisterVerificationChallengeError,
  startRegisterVerificationChallenge,
} from "@/modules/auth/server/register-verification-challenge";

export async function POST(request: Request) {
  // Rate limit: 5 registration attempts per 10 minutes per IP
  const rateLimitResponse = await withRateLimit("register", 5, 600);
  if (rateLimitResponse) return rateLimitResponse;

  const ip = await getClientIp();

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(fail("INVALID_BODY"), {
      status: 400,
    });
  }

  const rawPayload = payload as Record<string, unknown>;
  const locale = typeof rawPayload.locale === "string" ? rawPayload.locale : "tr";
  const normalizedEmail = typeof rawPayload.email === "string" ? rawPayload.email.trim().toLowerCase() : null;

  try {
    const user = await registerUser(payload);
    let challenge: { challengeId: string; emailCodeExpiresAt: Date };

    try {
      challenge = await startRegisterVerificationChallenge({
        userId: user.id,
        locale,
      });
    } catch (error) {
      // Security-sensitive: avoid leaving an unreachable unverified account
      // when verification challenge delivery/setup fails.
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {
        // best-effort rollback; original error is handled below
      });
      throw error;
    }

    logAudit("register_success", ip, user.id);

    return NextResponse.json(ok({
      userId: user.id,
      challengeId: challenge.challengeId,
      emailCodeExpiresAt: challenge.emailCodeExpiresAt.toISOString(),
    }), {
      status: 201,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(fail("VALIDATION_FAILED"), {
        status: 400,
      });
    }

    if (error instanceof RegisterUserError && error.code === "EMAIL_TAKEN") {
      if (normalizedEmail) {
        const pendingUser = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: { id: true, emailVerified: true },
        });

        if (pendingUser && !pendingUser.emailVerified) {
          try {
            const challenge = await startRegisterVerificationChallenge({
              userId: pendingUser.id,
              locale,
            });

            logAudit("register_verification_restarted", ip, pendingUser.id);
            return NextResponse.json(ok({
              userId: pendingUser.id,
              challengeId: challenge.challengeId,
              emailCodeExpiresAt: challenge.emailCodeExpiresAt.toISOString(),
            }), {
              status: 200,
            });
          } catch {
            // fall through to EMAIL_TAKEN response to avoid leaking internals
          }
        }
      }

      return NextResponse.json(fail("EMAIL_TAKEN"), {
        status: 409,
      });
    }

    if (error instanceof RegisterVerificationChallengeError) {
      logAudit("register_verification_failed", ip, undefined, {
        step: "start",
        reason: error.code,
      });
      return NextResponse.json(fail("REGISTER_VERIFICATION_START_FAILED"), {
        status: 500,
      });
    }

    console.error("Failed to register user", error);
    return NextResponse.json(fail("REGISTER_VERIFICATION_START_FAILED"), {
      status: 500,
    });
  }
}

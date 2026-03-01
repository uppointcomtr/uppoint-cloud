import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit-log";
import { fail, ok } from "@/lib/http/response";
import { getClientIp, withRateLimit } from "@/lib/rate-limit";
import { createAndSendEmailVerificationToken } from "@/modules/auth/server/email-verification";
import {
  registerUser,
  RegisterUserError,
} from "@/modules/auth/server/register-user";

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

  try {
    const user = await registerUser(payload);

    // Security-sensitive: email delivery failures must not expose internals to clients.
    try {
      await createAndSendEmailVerificationToken(user.email, locale);
    } catch (emailError) {
      console.error("Failed to send email verification", emailError);
    }

    logAudit("register_success", ip, user.id);

    return NextResponse.json(ok({ userId: user.id }), {
      status: 201,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(fail("VALIDATION_FAILED"), {
        status: 400,
      });
    }

    if (error instanceof RegisterUserError && error.code === "EMAIL_TAKEN") {
      return NextResponse.json(fail("EMAIL_TAKEN"), {
        status: 409,
      });
    }

    console.error("Failed to register user", error);
    return NextResponse.json(fail("REGISTER_FAILED"), {
      status: 500,
    });
  }
}

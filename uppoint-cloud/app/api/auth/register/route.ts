import { NextResponse } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/http/response";
import { withRateLimit } from "@/lib/rate-limit";
import {
  registerUser,
  RegisterUserError,
} from "@/modules/auth/server/register-user";
import { sendRegistrationNotifications } from "@/modules/auth/server/auth-notifications";

export async function POST(request: Request) {
  // Rate limit: 5 registration attempts per 10 minutes per IP
  const rateLimitResponse = await withRateLimit("register", 5, 600);
  if (rateLimitResponse) return rateLimitResponse;

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(fail("INVALID_BODY"), {
      status: 400,
    });
  }

  try {
    const user = await registerUser(payload);

    // Security-sensitive: notification delivery failures must not expose internals to clients.
    try {
      await sendRegistrationNotifications({
        email: user.email,
        name: user.name,
        phone: user.phone,
      });
    } catch (notificationError) {
      console.error("Failed to send registration notifications", notificationError);
    }

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

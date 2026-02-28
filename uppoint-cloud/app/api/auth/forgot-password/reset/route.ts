import { NextResponse } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/http/response";
import {
  completePasswordReset,
  PasswordResetError,
} from "@/modules/auth/server/password-reset";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  try {
    await completePasswordReset(payload);
    return NextResponse.json(ok({ reset: true }), { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
    }

    if (
      error instanceof PasswordResetError &&
      error.code === "INVALID_OR_EXPIRED_TOKEN"
    ) {
      return NextResponse.json(fail("INVALID_OR_EXPIRED_TOKEN"), {
        status: 400,
      });
    }

    console.error("Failed to reset password", error);
    return NextResponse.json(fail("RESET_PASSWORD_FAILED"), {
      status: 500,
    });
  }
}

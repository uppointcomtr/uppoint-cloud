import { NextResponse } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/http/response";
import { requestPasswordReset } from "@/modules/auth/server/password-reset";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  try {
    await requestPasswordReset(payload);

    return NextResponse.json(ok({ accepted: true }), { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(fail("VALIDATION_FAILED"), { status: 400 });
    }

    console.error("Failed to process forgot-password request", error);
    return NextResponse.json(fail("FORGOT_PASSWORD_REQUEST_FAILED"), {
      status: 500,
    });
  }
}

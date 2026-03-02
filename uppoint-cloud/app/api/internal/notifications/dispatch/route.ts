import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

import { env } from "@/lib/env";
import { fail, ok } from "@/lib/http/response";
import { dispatchNotificationOutboxBatch } from "@/modules/notifications/server/outbox";

function matchesToken(provided: string | null, expected: string): boolean {
  const providedBuffer = Buffer.from(provided ?? "");
  const expectedBuffer = Buffer.from(expected);

  return (
    providedBuffer.length === expectedBuffer.length
    && timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

export async function POST(request: Request) {
  if (!env.HEALTHCHECK_TOKEN || !matchesToken(request.headers.get("x-health-token"), env.HEALTHCHECK_TOKEN)) {
    return NextResponse.json(fail("UNAUTHORIZED"), { status: 401 });
  }

  const result = await dispatchNotificationOutboxBatch({
    batchSize: 50,
  });

  return NextResponse.json(ok(result), { status: 200 });
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

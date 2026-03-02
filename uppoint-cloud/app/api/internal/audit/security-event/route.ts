import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { z } from "zod";

import { logAudit } from "@/lib/audit-log";
import { env } from "@/lib/env";
import { fail, ok } from "@/lib/http/response";

const securityEventSchema = z.object({
  action: z.enum(["edge_host_rejected", "edge_origin_rejected"]),
  requestId: z.string().trim().min(1).max(128),
  path: z.string().trim().min(1).max(512),
  method: z.string().trim().min(1).max(16),
  host: z.string().trim().max(255).optional(),
  forwardedHost: z.string().trim().max(255).optional(),
  origin: z.string().trim().max(512).optional(),
  reason: z.string().trim().max(128).optional(),
});

function matchesInternalAuditToken(providedToken: string | null): boolean {
  const expectedToken = env.AUTH_SECRET;
  const providedBuffer = Buffer.from(providedToken ?? "");
  const expectedBuffer = Buffer.from(expectedToken);

  return (
    providedBuffer.length === expectedBuffer.length
    && timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

export async function POST(request: Request) {
  if (!matchesInternalAuditToken(request.headers.get("x-internal-audit-token"))) {
    return NextResponse.json(fail("UNAUTHORIZED"), { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  const parsed = securityEventSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(fail("INVALID_BODY"), { status: 400 });
  }

  const event = parsed.data;
  await logAudit(event.action, "unknown", undefined, {
    requestId: event.requestId,
    path: event.path,
    method: event.method,
    host: event.host,
    forwardedHost: event.forwardedHost,
    origin: event.origin,
    reason: event.reason,
    result: "FAILURE",
    targetId: event.host ?? event.origin ?? event.path,
  });

  return NextResponse.json(ok({ accepted: true }), { status: 202 });
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

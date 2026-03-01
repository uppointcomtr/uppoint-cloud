import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit-log";
import { ok } from "@/lib/http/response";
import { getClientIp, withRateLimit } from "@/lib/rate-limit";

export async function POST() {
  // Rate limit: 20 attempts per minute per IP — sufficient for multi-device logout, blocks flood.
  const rateLimitResponse = await withRateLimit("logout", 20, 60);
  if (rateLimitResponse) {
    const limitedIp = await getClientIp();
    logAudit("rate_limit_exceeded", limitedIp, undefined, { action: "logout", scope: "ip" });
    return rateLimitResponse;
  }

  const ip = await getClientIp();
  const session = await auth();

  logAudit("logout_success", ip, session?.user?.id);

  return NextResponse.json(ok({ accepted: true }), { status: 200 });
}

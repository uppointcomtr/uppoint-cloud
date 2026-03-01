import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit-log";
import { ok } from "@/lib/http/response";
import { getClientIp } from "@/lib/rate-limit";

export async function POST() {
  const ip = await getClientIp();
  const session = await auth();

  logAudit("logout_success", ip, session?.user?.id);

  return NextResponse.json(ok({ accepted: true }), { status: 200 });
}

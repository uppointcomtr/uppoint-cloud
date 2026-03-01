import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

import { prisma } from "@/db/client";
import { env } from "@/lib/env";

// Health check endpoint for monitoring / load-balancer liveness probes.
// Returns 200 + JSON when the app and DB are reachable; 503 otherwise.
export async function GET(request: Request) {
  if (env.NODE_ENV === "production" && env.HEALTHCHECK_TOKEN) {
    const token = request.headers.get("x-health-token");
    const expectedToken = env.HEALTHCHECK_TOKEN;
    const tokenBuffer = Buffer.from(token ?? "");
    const expectedTokenBuffer = Buffer.from(expectedToken);

    const tokenMatches =
      tokenBuffer.length === expectedTokenBuffer.length
      && timingSafeEqual(tokenBuffer, expectedTokenBuffer);

    if (!tokenMatches) {
      return NextResponse.json(
        { success: false, error: "UNAUTHORIZED", status: "unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { success: true, data: { status: "ok" }, status: "ok" },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[health] DB check failed:", err);
    return NextResponse.json(
      { success: false, error: "HEALTHCHECK_FAILED", status: "error" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

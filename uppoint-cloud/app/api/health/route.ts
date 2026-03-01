import { NextResponse } from "next/server";

import { prisma } from "@/db/client";
import { env } from "@/lib/env/server";

// Health check endpoint for monitoring / load-balancer liveness probes.
// Returns 200 + JSON when the app and DB are reachable; 503 otherwise.
export async function GET(request: Request) {
  if (env.NODE_ENV === "production" && env.HEALTHCHECK_TOKEN) {
    const token = request.headers.get("x-health-token");

    if (!token || token !== env.HEALTHCHECK_TOKEN) {
      return NextResponse.json(
        { status: "unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok" },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[health] DB check failed:", err);
    return NextResponse.json(
      { status: "error" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

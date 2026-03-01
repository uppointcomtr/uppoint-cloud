import { NextResponse } from "next/server";

import { prisma } from "@/db/client";

// Health check endpoint for monitoring / load-balancer liveness probes.
// Returns 200 + JSON when the app and DB are reachable; 503 otherwise.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", db: "ok", timestamp: new Date().toISOString() },
      { status: 200 }
    );
  } catch (err) {
    console.error("[health] DB check failed:", err);
    return NextResponse.json(
      { status: "error", db: "unreachable", timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}

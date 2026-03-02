import { NextResponse } from "next/server";

import { fail } from "@/lib/http/response";

function deprecatedResponse() {
  return NextResponse.json(
    fail("ENDPOINT_DEPRECATED"),
    { status: 410 },
  );
}

export async function GET() {
  return deprecatedResponse();
}

export async function POST() {
  return deprecatedResponse();
}

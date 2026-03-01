import { NextResponse } from "next/server";

import { fail } from "@/lib/http/response";

export async function POST() {
  return NextResponse.json(
    fail("ENDPOINT_DEPRECATED"),
    { status: 410 },
  );
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

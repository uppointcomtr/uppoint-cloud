import { NextResponse } from "next/server";

import { fail } from "@/lib/http/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function imageUploadDisabledResponse() {
  return NextResponse.json(fail("IMAGE_UPLOAD_DISABLED"), { status: 410 });
}

export async function POST() {
  return imageUploadDisabledResponse();
}

export async function GET() {
  return imageUploadDisabledResponse();
}

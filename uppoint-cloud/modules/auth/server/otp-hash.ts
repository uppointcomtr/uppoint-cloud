import "server-only";

import crypto from "crypto";

import { env } from "@/lib/env/server";

function resolveOtpPepper(): string {
  return env.AUTH_OTP_PEPPER ?? env.AUTH_SECRET;
}

export function hashOtpCode(code: string): string {
  return crypto
    .createHmac("sha256", resolveOtpPepper())
    .update(code)
    .digest("hex");
}

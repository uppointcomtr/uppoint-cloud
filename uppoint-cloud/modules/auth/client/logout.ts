"use client";

import { signOut } from "next-auth/react";

interface PerformLogoutOptions {
  callbackUrl: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  signOutImpl?: typeof signOut;
}

export class LogoutError extends Error {
  code: "LOGOUT_REQUEST_FAILED" | "LOGOUT_REJECTED";

  constructor(code: "LOGOUT_REQUEST_FAILED" | "LOGOUT_REJECTED") {
    super(code);
    this.name = "LogoutError";
    this.code = code;
  }
}

/**
 * Security-sensitive: never destroy the local session unless server-side revocation succeeded first.
 */
export async function performLogout({
  callbackUrl,
  timeoutMs = 5_000,
  fetchImpl = fetch,
  signOutImpl = signOut,
}: PerformLogoutOptions): Promise<void> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl("/api/auth/logout", {
      method: "POST",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new LogoutError("LOGOUT_REJECTED");
    }
  } catch (error) {
    if (error instanceof LogoutError) {
      throw error;
    }

    throw new LogoutError("LOGOUT_REQUEST_FAILED");
  } finally {
    globalThis.clearTimeout(timeoutId);
  }

  await signOutImpl({ callbackUrl });
}

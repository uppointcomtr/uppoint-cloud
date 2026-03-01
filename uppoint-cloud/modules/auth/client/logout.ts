"use client";

import { signOut } from "next-auth/react";

interface PerformLogoutOptions {
  callbackUrl: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  signOutImpl?: typeof signOut;
}

/**
 * Ensures logout audit/revocation endpoint is attempted before next-auth signOut.
 * signOut always runs even if audit endpoint is unavailable.
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
    await fetchImpl("/api/auth/logout", {
      method: "POST",
      signal: controller.signal,
    });
  } catch {
    // Best-effort endpoint: user logout must continue.
  } finally {
    globalThis.clearTimeout(timeoutId);
  }

  await signOutImpl({ callbackUrl });
}

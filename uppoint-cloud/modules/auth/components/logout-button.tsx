"use client";

import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";
import type { Locale } from "@/modules/i18n/config";
import { withLocale } from "@/modules/i18n/paths";

interface LogoutButtonProps {
  locale: Locale;
  label: string;
}

export function LogoutButton({ locale, label }: LogoutButtonProps) {
  async function handleLogout() {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5_000);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        signal: controller.signal,
      });
    } catch {
      // Best-effort audit logging; logout must continue even if audit endpoint fails.
    } finally {
      window.clearTimeout(timeoutId);
    }

    await signOut({ callbackUrl: withLocale("/login", locale) });
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => void handleLogout()}
    >
      {label}
    </Button>
  );
}

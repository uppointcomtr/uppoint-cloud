"use client";

import { Button } from "@/components/ui/button";
import { performLogout } from "@/modules/auth/client/logout";
import type { Locale } from "@/modules/i18n/config";
import { withLocale } from "@/modules/i18n/paths";

interface LogoutButtonProps {
  locale: Locale;
  label: string;
}

export function LogoutButton({ locale, label }: LogoutButtonProps) {
  async function handleLogout() {
    await performLogout({ callbackUrl: withLocale("/login", locale) });
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

"use client";

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { performLogout } from "@/modules/auth/client/logout";
import type { Locale } from "@/modules/i18n/config";
import { withLocale } from "@/modules/i18n/paths";

interface LogoutButtonProps {
  locale: Locale;
  label: string;
  /** Render as a compact icon-only button */
  iconOnly?: boolean;
}

export function LogoutButton({ locale, label, iconOnly }: LogoutButtonProps) {
  async function handleLogout() {
    await performLogout({ callbackUrl: withLocale("/login", locale) });
  }

  if (iconOnly) {
    return (
      <button
        type="button"
        title={label}
        aria-label={label}
        onClick={() => void handleLogout()}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
    );
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

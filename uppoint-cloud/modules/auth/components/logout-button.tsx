"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { performLogout } from "@/modules/auth/client/logout";
import type { Locale } from "@/modules/i18n/config";
import { withLocale } from "@/modules/i18n/paths";

interface LogoutButtonProps {
  locale: Locale;
  labels: {
    button: string;
    failed: string;
  };
  /** Render as a compact icon-only button */
  iconOnly?: boolean;
}

export function LogoutButton({ locale, labels, iconOnly }: LogoutButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    if (isLoggingOut) {
      return;
    }

    setError(null);
    setIsLoggingOut(true);

    try {
      await performLogout({ callbackUrl: withLocale("/login", locale) });
    } catch {
      setError(labels.failed);
      setIsLoggingOut(false);
    }
  }

  if (iconOnly) {
    return (
      <div className="relative">
        <button
          type="button"
          title={labels.button}
          aria-label={labels.button}
          disabled={isLoggingOut}
          onClick={() => void handleLogout()}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
        {error ? (
          <p
            role="alert"
            className="absolute right-0 top-full z-20 mt-2 w-52 rounded-md border border-destructive/20 bg-background px-3 py-2 text-xs text-destructive shadow-lg"
          >
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={isLoggingOut}
        onClick={() => void handleLogout()}
      >
        {labels.button}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

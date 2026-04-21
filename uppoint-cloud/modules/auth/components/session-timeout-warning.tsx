"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { performLogout } from "@/modules/auth/client/logout";
import type { Locale } from "@/modules/i18n/config";
import { withLocale } from "@/modules/i18n/paths";

interface SessionTimeoutDictionary {
  warning: string;
  minutesRemaining: string;
  signOut: string;
  signOutLoading: string;
  signOutFailed: string;
}

interface SessionTimeoutWarningProps {
  locale: Locale;
  dictionary: SessionTimeoutDictionary;
  /** ISO date string from session.expires */
  sessionExpires: string;
}

const WARNING_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds

export function SessionTimeoutWarning({
  locale,
  dictionary,
  sessionExpires,
}: SessionTimeoutWarningProps) {
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    function checkExpiry() {
      const msLeft = new Date(sessionExpires).getTime() - Date.now();
      if (msLeft > 0 && msLeft <= WARNING_THRESHOLD_MS) {
        setMinutesLeft(Math.ceil(msLeft / 60_000));
      } else {
        setMinutesLeft(null);
      }
    }

    checkExpiry();
    const id = window.setInterval(checkExpiry, CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [sessionExpires]);

  if (minutesLeft === null) return null;

  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
      <span className="flex-1">
        {dictionary.warning}{" "}
        <span className="font-medium">
          {minutesLeft} {dictionary.minutesRemaining}
        </span>
        {signOutError ? (
          <span className="mt-1 block text-xs font-medium text-destructive">
            {signOutError}
          </span>
        ) : null}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isSigningOut}
        className="h-7 shrink-0 border-amber-300 bg-transparent text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
        onClick={() => {
          if (isSigningOut) {
            return;
          }

          setSignOutError(null);
          setIsSigningOut(true);
          void performLogout({ callbackUrl: withLocale("/login", locale) }).catch(() => {
            setSignOutError(dictionary.signOutFailed);
            setIsSigningOut(false);
          });
        }}
      >
        {isSigningOut ? dictionary.signOutLoading : dictionary.signOut}
      </Button>
    </div>
  );
}

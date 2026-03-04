"use client";

import { useEffect, useMemo } from "react";

import { isStaleServerActionError } from "@/lib/errors/stale-server-action";
import { getErrorMessages, resolveLocaleFromPathname } from "@/modules/i18n/error-messages";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// Catches errors thrown inside app/layout.tsx itself.
// Must include its own <html> and <body> since the root layout is unavailable.
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error("[GlobalError]", error);
    }
  }, [error]);

  const locale = useMemo(
    () => resolveLocaleFromPathname(typeof window !== "undefined" ? window.location.pathname : null),
    [],
  );
  const dictionary = getErrorMessages(locale);
  const staleServerActionError = isStaleServerActionError(error);

  return (
    <html lang={locale}>
      <body className="m-0 flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="w-full max-w-md px-8 py-10 text-center">
          <h1 className="mb-3 text-2xl font-semibold tracking-tight">
            {staleServerActionError ? dictionary.staleActionTitle : dictionary.unexpectedErrorTitle}
          </h1>
          <p className="mb-6 text-sm text-muted-foreground">
            {staleServerActionError
              ? dictionary.staleActionDescription
              : error.digest
              ? `${dictionary.codePrefix}: ${error.digest}`
              : dictionary.fallbackDescription}
          </p>
          <button
            onClick={staleServerActionError ? () => window.location.reload() : reset}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {staleServerActionError ? dictionary.refreshPage : dictionary.retry}
          </button>
        </div>
      </body>
    </html>
  );
}

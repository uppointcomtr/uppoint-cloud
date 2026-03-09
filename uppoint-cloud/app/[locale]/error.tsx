"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { isStaleServerActionError } from "@/lib/errors/stale-server-action";
import { getErrorMessages, resolveLocaleFromPathname } from "@/modules/i18n/error-messages";
import { withLocale } from "@/modules/i18n/paths";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// Catches runtime errors thrown in any page or layout within app/[locale]/.
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error("[ErrorBoundary]", error);
    }
  }, [error]);

  const pathname = usePathname();
  const locale = resolveLocaleFromPathname(pathname);
  const dictionary = getErrorMessages(locale);
  const staleServerActionError = isStaleServerActionError(error);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          {dictionary.errorLabel}
        </p>
        <h1 className="corp-heading-1">
          {staleServerActionError ? dictionary.staleActionTitle : dictionary.somethingWentWrongTitle}
        </h1>
        <p className="corp-body-muted">
          {staleServerActionError
            ? dictionary.staleActionDescription
            : error.digest
            ? `${dictionary.codePrefix}: ${error.digest}`
            : dictionary.fallbackDescription}
        </p>
      </div>

      <div className="flex gap-3">
        {staleServerActionError ? (
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            {dictionary.refreshPage}
          </button>
        ) : (
          <button
            onClick={reset}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            {dictionary.retry}
          </button>
        )}
        <Link
          href={withLocale("/login", locale)}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          {dictionary.backToLogin}
        </Link>
      </div>
    </div>
  );
}

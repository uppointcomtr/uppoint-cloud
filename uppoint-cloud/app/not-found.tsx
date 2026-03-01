"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { getErrorMessages, resolveLocaleFromPathname } from "@/modules/i18n/error-messages";
import { withLocale } from "@/modules/i18n/paths";

// Displayed for any unmatched route (404).
export default function NotFound() {
  const pathname = usePathname();
  const locale = resolveLocaleFromPathname(pathname);
  const dictionary = getErrorMessages(locale);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          404
        </p>
        <h1 className="text-3xl font-bold tracking-tight">{dictionary.notFoundTitle}</h1>
        <p className="text-muted-foreground">
          {dictionary.notFoundDescription}
        </p>
      </div>

      <Link
        href={withLocale("/login", locale)}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        {dictionary.backToLogin}
      </Link>
    </div>
  );
}

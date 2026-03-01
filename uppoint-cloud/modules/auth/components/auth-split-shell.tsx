import Image from "next/image";
import type { ReactNode } from "react";

import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";

interface AuthSplitShellProps {
  locale: Locale;
  header: Dictionary["header"];
  children: ReactNode;
}

export function AuthSplitShell({ locale, header, children }: AuthSplitShellProps) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4 sm:p-8">
      {/* Glow 1 — top-left, large, primary */}
      <div aria-hidden className="pointer-events-none absolute -left-32 -top-32 h-[480px] w-[480px] rounded-full bg-primary/15 blur-[120px] dark:bg-primary/20" />
      {/* Glow 2 — bottom-right, medium, primary tint */}
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-24 h-[360px] w-[360px] rounded-full bg-primary/10 blur-[100px] dark:bg-primary/15" />
      {/* Glow 3 — center-right, small accent */}
      <div aria-hidden className="pointer-events-none absolute right-[15%] top-[30%] h-[220px] w-[220px] rounded-full bg-primary/8 blur-[80px] dark:bg-primary/12" />

      {/* Centered card */}
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl dark:border-white/10 dark:shadow-black/60">
        <div className="flex flex-col px-8 py-8 sm:px-10">
          <div className="flex items-center justify-between">
            <Image
              src="/logo/uppoint-logo-black.webp"
              alt="Uppoint Cloud"
              width={416}
              height={127}
              unoptimized
              className="block w-[180px] h-auto dark:hidden"
            />
            <Image
              src="/logo/Uppoint-logo-wh.webp"
              alt="Uppoint Cloud"
              width={416}
              height={127}
              unoptimized
              className="hidden w-[180px] h-auto dark:block"
            />
            <div className="flex items-center gap-2">
              <ThemeToggle labels={header.theme} iconOnly />
              <LocaleSwitcher locale={locale} labels={header.locales} />
            </div>
          </div>

          <div className="py-8">
            {children}
          </div>

          <p className="text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Uppoint Cloud
          </p>
        </div>
      </div>
    </main>
  );
}

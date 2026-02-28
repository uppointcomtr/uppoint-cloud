import Image from "next/image";
import type { ReactNode } from "react";

import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";

interface AuthSplitShellProps {
  locale: Locale;
  header: Dictionary["header"];
  panel: Dictionary["authShell"];
  children: ReactNode;
}

export function AuthSplitShell({ locale, header, children }: AuthSplitShellProps) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 p-4 dark:bg-zinc-950 sm:p-8">
      {/* Page background pattern */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:radial-gradient(circle,oklch(0_0_0/0.06)_1px,transparent_1px)] [background-size:24px_24px] dark:[background-image:radial-gradient(circle,oklch(1_0_0/0.05)_1px,transparent_1px)]"
      />

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

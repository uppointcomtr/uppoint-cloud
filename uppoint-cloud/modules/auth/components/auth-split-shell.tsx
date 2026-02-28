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
        className="pointer-events-none absolute inset-0 [background-image:radial-gradient(circle,oklch(0_0_0/0.06)_1px,transparent_1px)] [background-size:24px_24px] dark:[background-image:radial-gradient(circle,oklch(1_0_0/0.04)_1px,transparent_1px)]"
      />

      {/* Centered card */}
      <div className="relative z-10 w-full max-w-4xl overflow-hidden rounded-2xl border border-border/50 shadow-2xl">
        <div className="grid min-h-[600px] lg:grid-cols-[440px_minmax(0,1fr)]">

          {/* LEFT — Form panel */}
          <div className="flex flex-col bg-background px-8 py-8 sm:px-10">
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

            <div className="flex flex-1 flex-col justify-center py-8">
              {children}
            </div>

            <p className="text-center text-xs text-muted-foreground">
              © {new Date().getFullYear()} Uppoint Cloud
            </p>
          </div>

          {/* RIGHT — Hero image panel */}
          <div className="relative hidden lg:block">
            <Image
              src="/images/auth/auth-hero.jpg"
              alt=""
              fill
              priority
              quality={90}
              sizes="(min-width: 1024px) 560px, 0px"
              className="object-cover object-center"
            />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/20 to-transparent" />
            <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_60%,oklch(0.35_0.12_155/0.3)_0%,transparent_65%)]" />
          </div>

        </div>
      </div>
    </main>
  );
}

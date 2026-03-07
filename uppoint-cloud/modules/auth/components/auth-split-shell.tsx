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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 sm:px-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in oklab, var(--border) 35%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--border) 35%, transparent) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,color-mix(in_oklab,var(--primary)_12%,transparent),transparent_42%),radial-gradient(circle_at_80%_10%,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_48%)]" />

      <div className="relative z-10 mx-auto w-full max-w-[540px]">
        <section className="w-full overflow-hidden rounded-3xl border border-border/70 bg-card/95 shadow-[0_30px_80px_-48px_rgba(15,23,42,0.65)] backdrop-blur-xl dark:bg-card/90">
          <div className="flex flex-col px-6 py-6 sm:px-10 sm:py-8">
            <div className="flex items-center justify-between">
              <Image
                src="/logo/uppoint-logo-black.webp"
                alt="Uppoint Cloud"
                width={416}
                height={127}
                className="block h-auto w-[176px] dark:hidden"
              />
              <Image
                src="/logo/Uppoint-logo-wh.webp"
                alt="Uppoint Cloud"
                width={416}
                height={127}
                className="hidden h-auto w-[176px] dark:block"
              />
              <div className="flex items-center gap-2">
                <ThemeToggle
                  labels={header.theme}
                  iconOnly
                  className="border-border/70 bg-background/90 dark:bg-background/70"
                />
                <LocaleSwitcher
                  locale={locale}
                  labels={header.locales}
                  className="border-border/70 bg-background/90 dark:bg-background/70"
                />
              </div>
            </div>

            <div className="py-6 sm:py-8">
              {children}
            </div>

            <p className="text-center text-xs font-medium tracking-wide text-muted-foreground">
              © {new Date().getFullYear()} Uppoint Cloud
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

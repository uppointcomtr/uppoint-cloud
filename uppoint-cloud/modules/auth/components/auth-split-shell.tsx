import Image from "next/image";
import type { ReactNode } from "react";

import { LocaleSwitcher } from "@/components/shared/locale-switcher";
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
    <main className="relative isolate min-h-screen overflow-hidden">
      <div className="grid min-h-screen w-full lg:grid-cols-[440px_minmax(0,1fr)]">

        {/* LEFT — Dark form panel */}
        <section className="relative z-10 flex min-h-screen flex-col border-r border-border/40 bg-background px-8 py-6">
          <header className="mb-10 flex items-center justify-between">
            <Image
              src="/logo/uppoint-logo-black.webp"
              alt="Uppoint Cloud"
              width={416}
              height={127}
              unoptimized
              className="block h-8 w-auto dark:hidden"
            />
            <Image
              src="/logo/Uppoint-logo-wh.webp"
              alt="Uppoint Cloud"
              width={416}
              height={127}
              unoptimized
              className="hidden h-8 w-auto dark:block"
            />
            <LocaleSwitcher locale={locale} labels={header.locales} />
          </header>

          <div className="w-full max-w-sm flex-1">
            {children}
          </div>

          <footer className="text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Uppoint Cloud
          </footer>
        </section>

        {/* RIGHT — Full-bleed hero image panel */}
        <aside className="relative hidden min-h-screen overflow-hidden lg:flex lg:flex-col lg:justify-between">
          {/* Hero image */}
          <Image
            src="/images/auth/auth-hero.jpg"
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 60vw, 0px"
            className="object-cover object-center"
          />
          {/* Dark overlay — bottom fade for text legibility */}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
          {/* Emerald tint layer */}
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_60%,oklch(0.35_0.12_155/0.35)_0%,transparent_65%)]" />

        </aside>
      </div>
    </main>
  );
}

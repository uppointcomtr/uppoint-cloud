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

export function AuthSplitShell({ locale, header, panel, children }: AuthSplitShellProps) {
  return (
    <main className="relative isolate min-h-screen overflow-hidden">
      <div className="grid min-h-screen w-full lg:grid-cols-[minmax(360px,440px)_minmax(0,1fr)]">
        <section className="relative z-10 flex min-h-screen items-start justify-start border-r border-border/60 bg-background px-4 pb-8 pt-4 sm:px-8 sm:pt-6 lg:px-10 lg:pt-8">
          <div className="w-full max-w-md space-y-6">
            <div className="flex items-center justify-start">
              <LocaleSwitcher locale={locale} labels={header.locales} />
            </div>
            {children}
          </div>
        </section>

        <aside className="relative hidden min-h-screen overflow-hidden lg:block">
          <Image
            src="/images/auth/auth-side-hero.jpg"
            alt={panel.title}
            fill
            priority
            sizes="(min-width: 1024px) 65vw, 0px"
            className="object-cover"
          />

          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/40 to-black/25" />
          <div
            aria-hidden
            className="absolute inset-0 [background-image:radial-gradient(hsl(0_0%_100%/.26)_0.8px,transparent_0.8px)] [background-size:3px_3px] opacity-20"
          />

          <div className="absolute inset-x-8 bottom-8 space-y-5">
            <div className="inline-flex items-center gap-4 rounded-xl border border-white/20 bg-black/20 px-4 py-3 backdrop-blur-sm">
              <Image
                src="/logo/Uppoint-logo-wh.webp"
                alt="Uppoint"
                width={416}
                height={127}
                unoptimized
                className="h-8 w-auto"
              />
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white md:text-base">
                {panel.eyebrow}
              </p>
            </div>
            <h2 className="max-w-2xl text-3xl font-semibold leading-tight text-white">
              {panel.title}
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-white/85">
              {panel.description}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {panel.badges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-white/40 bg-white/10 px-3 py-1 text-xs font-medium text-white"
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

import Image from "next/image";
import type { ReactNode } from "react";
import { Check } from "lucide-react";

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
    <main className="dark relative isolate min-h-screen overflow-hidden">
      <div className="grid min-h-screen w-full lg:grid-cols-[440px_minmax(0,1fr)]">

        {/* LEFT — Dark form panel */}
        <section className="relative z-10 flex min-h-screen flex-col border-r border-border/40 bg-background px-8 py-6">
          <header className="mb-10 flex items-center justify-between">
            <Image
              src="/logo/Uppoint-logo-wh.webp"
              alt="Uppoint Cloud"
              width={416}
              height={127}
              unoptimized
              className="h-8 w-auto"
            />
            <LocaleSwitcher locale={locale} labels={header.locales} />
          </header>

          <div className="flex flex-1 items-center">
            <div className="w-full max-w-sm">
              {children}
            </div>
          </div>

          <footer className="mt-8 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Uppoint Cloud
          </footer>
        </section>

        {/* RIGHT — Emerald gradient panel */}
        <aside className="relative hidden min-h-screen overflow-hidden lg:flex lg:flex-col lg:justify-between">
          {/* Background layers */}
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_0%,oklch(0.35_0.12_155)_0%,oklch(0.14_0.05_160)_55%,oklch(0.10_0.02_155)_100%)]"
          />
          <div
            aria-hidden
            className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:56px_56px]"
          />
          <div aria-hidden className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-emerald-500/20 blur-[100px]" />
          <div aria-hidden className="absolute bottom-10 left-10 h-64 w-64 rounded-full bg-primary/15 blur-[80px]" />

          {/* TOP: Logo badge */}
          <div className="relative z-10 p-10">
            <div className="inline-flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-sm">
              <Image
                src="/logo/Uppoint-logo-wh.webp"
                alt="Uppoint"
                width={416}
                height={127}
                unoptimized
                className="h-7 w-auto"
              />
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">
                {panel.eyebrow}
              </span>
            </div>
          </div>

          {/* CENTER: Headline + feature list */}
          <div className="relative z-10 max-w-lg space-y-8 px-10">
            <div>
              <h2 className="text-3xl font-bold leading-snug text-white">
                {panel.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-white/65">
                {panel.description}
              </p>
            </div>

            <ul className="space-y-4">
              {panel.highlights.map((h) => (
                <li key={h.title} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/20">
                    <Check className="h-3 w-3 text-primary" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{h.title}</p>
                    <p className="mt-0.5 text-xs text-white/55">{h.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* BOTTOM: Badges */}
          <div className="relative z-10 flex flex-wrap gap-2 p-10">
            {panel.badges.map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium text-white/80"
              >
                {badge}
              </span>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}

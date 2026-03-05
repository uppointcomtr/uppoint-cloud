import Image from "next/image";
import type { ReactNode } from "react";
import { Headset, Server, ShieldCheck } from "lucide-react";

import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";

interface AuthSplitShellProps {
  locale: Locale;
  header: Dictionary["header"];
  shell: Dictionary["authShell"];
  children: ReactNode;
}

export function AuthSplitShell({ locale, header, shell, children }: AuthSplitShellProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background px-4 py-6 sm:px-8 sm:py-8">
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

      <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[minmax(0,540px)_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-3xl border border-border/70 bg-card/95 shadow-[0_30px_80px_-48px_rgba(15,23,42,0.65)] backdrop-blur-xl dark:bg-card/90">
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

        <aside className="relative hidden overflow-hidden rounded-3xl border border-border/70 bg-card/90 shadow-[0_30px_80px_-48px_rgba(15,23,42,0.65)] lg:block">
          <Image
            src="/images/auth/auth-side-hero.jpg"
            alt="Uppoint Cloud secure infrastructure"
            fill
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(125deg,rgba(4,9,20,0.84),rgba(7,14,30,0.58),rgba(4,9,20,0.84))]" />
          <div className="absolute inset-0 p-10 xl:p-12">
            <p className="text-xs font-semibold tracking-[0.18em] text-white/80">{shell.eyebrow}</p>
            <h1 className="mt-4 max-w-xl text-3xl font-semibold leading-tight text-white xl:text-[2.05rem]">
              {shell.title}
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/80">
              {shell.description}
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {shell.badges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-white/25 bg-black/25 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-sm"
                >
                  {badge}
                </span>
              ))}
            </div>

            <div className="mt-10 grid gap-4">
              {shell.highlights.map((highlight, index) => {
                const Icon = index === 0 ? Headset : index === 1 ? ShieldCheck : Server;

                return (
                  <div
                    key={highlight.title}
                    className="rounded-2xl border border-white/15 bg-black/30 p-4 backdrop-blur-sm"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-white">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-white">{highlight.title}</p>
                        <p className="text-xs leading-5 text-white/75">{highlight.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

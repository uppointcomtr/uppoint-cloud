"use client";

import { Laptop2 } from "lucide-react";

import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";

interface CurrentSessionSnapshot {
  ip: string | null;
  userAgent: string | null;
  observedAtIso: string;
  loginAtIso: string | null;
}

interface SecurityActiveSessionsPanelProps {
  locale: Locale;
  labels: Dictionary["dashboard"]["security"];
  activeSessions: number;
  currentSession: CurrentSessionSnapshot;
}

function resolveDeviceName(userAgent: string | null, fallback: string): string {
  if (!userAgent) {
    return fallback;
  }

  const ua = userAgent.toLowerCase();

  const browser = ua.includes("edg/")
    ? "Edge"
    : ua.includes("chrome/")
      ? "Chrome"
      : ua.includes("firefox/")
        ? "Firefox"
        : ua.includes("safari/")
          ? "Safari"
          : "Browser";

  const os = ua.includes("windows")
    ? "Windows"
    : ua.includes("android")
      ? "Android"
      : ua.includes("iphone") || ua.includes("ipad")
        ? "iOS"
        : ua.includes("mac os")
          ? "macOS"
          : ua.includes("linux")
            ? "Linux"
            : "OS";

  return `${browser} / ${os}`;
}

export function SecurityActiveSessionsPanel({
  locale,
  labels,
  activeSessions,
  currentSession,
}: SecurityActiveSessionsPanelProps) {
  const currentSessionDevice = resolveDeviceName(currentSession.userAgent, labels.unknownDevice);
  const extraSessionCount = Math.max(activeSessions - 1, 0);
  const loginAt = currentSession.loginAtIso ?? currentSession.observedAtIso;

  return (
    <section className="rounded-2xl border border-border/70 bg-card/90 p-6 shadow-sm backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="corp-section-title">{labels.activeSessionsTitle}</h3>
          <p className="text-sm text-muted-foreground">{labels.activeSessionsDescription}</p>
        </div>
        <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {labels.sessionCountLabel}: {activeSessions}
        </div>
      </div>

      <div className="mt-4">
        {activeSessions > 0 ? (
          <div className="rounded-xl border border-border/60 bg-background/75 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Laptop2 className="h-4 w-4" />
              </span>
              <div>
                <p className="font-medium">{currentSessionDevice}</p>
                <p className="text-sm text-muted-foreground">
                  {labels.ipLabel}: {currentSession.ip ?? labels.unknownIp} · {labels.loginAtLabel}:{" "}
                  {new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(loginAt))}
                </p>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                {labels.currentDevice}
              </span>
            </div>
            {extraSessionCount > 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {labels.otherSessionsPrefix}: {extraSessionCount}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="rounded-lg border border-border/60 bg-background/60 px-4 py-3 text-sm text-muted-foreground">
            {labels.noActiveSessions}
          </p>
        )}
      </div>
    </section>
  );
}

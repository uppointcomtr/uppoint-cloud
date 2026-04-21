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
    <section className="corp-surface corp-surface-pad">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="corp-section-title">{labels.activeSessionsTitle}</h3>
          <p className="corp-body-muted">{labels.activeSessionsDescription}</p>
        </div>
        <div className="corp-badge corp-badge-info font-semibold">
          {labels.sessionCountLabel}: {activeSessions}
        </div>
      </div>

      <div className="mt-4">
        {activeSessions > 0 ? (
          <div className="corp-subcard border-border/60 bg-background/75">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Laptop2 className="h-4 w-4" />
              </span>
              <div>
                <p className="corp-title-base">{currentSessionDevice}</p>
                <p className="corp-body-muted">
                  {labels.ipLabel}: {currentSession.ip ?? labels.unknownIp} · {labels.loginAtLabel}:{" "}
                  {new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(loginAt))}
                </p>
              </div>
              <span className="corp-badge corp-badge-success">
                {labels.currentDevice}
              </span>
            </div>
            {extraSessionCount > 0 ? (
              <p className="corp-field-hint mt-3">
                {labels.otherSessionsPrefix}: {extraSessionCount}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="corp-subcard-sm text-muted-foreground">
            {labels.noActiveSessions}
          </p>
        )}
      </div>
    </section>
  );
}

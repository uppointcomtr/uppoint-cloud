"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Laptop2, Search, ShieldAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";

interface SecurityEventRow {
  id: string;
  action: string;
  result: string | null;
  reason: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAtIso: string;
}

interface SecurityCenterProps {
  locale: Locale;
  labels: Dictionary["dashboard"]["security"];
  activeSessions: number;
  auditFailures24h: number;
  events: SecurityEventRow[];
}

const DELETE_CONFIRM_TEXT = "DELETE";
const EVENTS_PER_PAGE = 5;

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

function resolveEventColor(result: string | null, action: string): string {
  if (result === "FAILURE" || action.includes("failed") || action.includes("denied")) {
    return "bg-red-500";
  }

  if (result === "SUCCESS" || action.includes("success") || action.includes("verified")) {
    return "bg-emerald-500";
  }

  if (action.includes("otp") || action.includes("challenge")) {
    return "bg-amber-500";
  }

  return "bg-blue-500";
}

function resolveActionLabel(
  action: string,
  labels: Dictionary["dashboard"]["security"]["actionLabels"],
): string {
  const translated = labels[action as keyof typeof labels];
  if (translated) {
    return translated;
  }

  return action.replace(/_/g, " ");
}

export function SecurityCenter({
  locale,
  labels,
  activeSessions,
  auditFailures24h,
  events,
}: SecurityCenterProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isEndingSessions, setIsEndingSessions] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const normalizedEvents = useMemo(() => events.map((event) => ({
    ...event,
    device: resolveDeviceName(event.userAgent, labels.unknownDevice),
    actionLabel: resolveActionLabel(event.action, labels.actionLabels),
  })), [events, labels.actionLabels, labels.unknownDevice]);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return normalizedEvents;
    }

    return normalizedEvents.filter((event) =>
      event.actionLabel.toLowerCase().includes(normalizedQuery)
      || (event.ip ?? "").toLowerCase().includes(normalizedQuery)
      || event.device.toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedEvents, query]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / EVENTS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * EVENTS_PER_PAGE;
  const pagedEvents = filteredEvents.slice(pageStart, pageStart + EVENTS_PER_PAGE);

  const currentSessionEvent = normalizedEvents[0] ?? null;
  const extraSessionCount = Math.max(activeSessions - (currentSessionEvent ? 1 : 0), 0);

  async function handleEndAllSessions() {
    if (isEndingSessions) return;
    if (!window.confirm(labels.endAllSessionsConfirm)) return;

    setError(null);
    setInfo(null);
    setIsEndingSessions(true);

    try {
      const response = await fetch("/api/auth/logout/all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        setError(labels.feedback.actionFailed);
        setIsEndingSessions(false);
        return;
      }

      setInfo(labels.feedback.sessionsEnded);
      router.push(withLocale("/login", locale));
      router.refresh();
    } catch {
      setError(labels.feedback.actionFailed);
      setIsEndingSessions(false);
    }
  }

  async function handleDeleteAccount() {
    if (isDeletingAccount) return;
    if (deleteConfirmText !== DELETE_CONFIRM_TEXT) {
      setError(labels.feedback.deleteConfirmMismatch);
      return;
    }

    setError(null);
    setInfo(null);
    setIsDeletingAccount(true);

    try {
      const response = await fetch("/api/auth/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmText: deleteConfirmText }),
      });

      if (!response.ok) {
        setError(labels.feedback.actionFailed);
        setIsDeletingAccount(false);
        return;
      }

      setInfo(labels.feedback.accountDeleted);
      router.push(withLocale("/login", locale));
      router.refresh();
    } catch {
      setError(labels.feedback.actionFailed);
      setIsDeletingAccount(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/70 bg-card/90 p-6 shadow-sm backdrop-blur">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{labels.accountTitle}</h2>
          <p className="text-sm text-muted-foreground">{labels.accountDescription}</p>
        </div>

        <div className="mt-5 space-y-4">
          <div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-background/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="font-medium">{labels.endAllSessionsTitle}</p>
              <p className="text-sm text-muted-foreground">{labels.endAllSessionsDescription}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
              disabled={isEndingSessions}
              onClick={() => void handleEndAllSessions()}
            >
              {isEndingSessions ? labels.actions.processing : labels.endAllSessionsAction}
            </Button>
          </div>

          <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 dark:border-red-900/50 dark:bg-red-950/20">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600 dark:text-red-300">
              {labels.dangerZoneLabel}
            </p>
            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="font-medium text-red-700 dark:text-red-200">{labels.deleteAccountTitle}</p>
                <p className="text-sm text-red-700/90 dark:text-red-300/90">{labels.deleteAccountDescription}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200"
                onClick={() => setShowDeleteConfirm((current) => !current)}
              >
                {labels.deleteAccountAction}
              </Button>
            </div>

            {showDeleteConfirm ? (
              <div className="mt-4 rounded-lg border border-red-200/80 bg-background/80 p-3 dark:border-red-900/70">
                <p className="text-sm font-medium text-foreground">{labels.deleteConfirmHint}</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={deleteConfirmText}
                    onChange={(event) => setDeleteConfirmText(event.target.value)}
                    placeholder={labels.deleteConfirmPlaceholder}
                    className="h-9"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={isDeletingAccount}
                      onClick={() => void handleDeleteAccount()}
                    >
                      {isDeletingAccount ? labels.actions.processing : labels.deleteConfirmAction}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isDeletingAccount}
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setDeleteConfirmText("");
                      }}
                    >
                      {labels.deleteCancel}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {(error || info) ? (
          <div className="mt-4 space-y-2">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {info ? (
              <Alert>
                <AlertDescription>{info}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border/70 bg-card/90 p-6 shadow-sm backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">{labels.activeSessionsTitle}</h3>
            <p className="text-sm text-muted-foreground">{labels.activeSessionsDescription}</p>
          </div>
          <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {labels.sessionCountLabel}: {activeSessions}
          </div>
        </div>

        <div className="mt-4">
          {currentSessionEvent ? (
            <div className="rounded-xl border border-border/60 bg-background/75 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Laptop2 className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-medium">{currentSessionEvent.device}</p>
                  <p className="text-sm text-muted-foreground">
                    {labels.ipLabel}: {currentSessionEvent.ip ?? labels.unknownIp} · {labels.loginAtLabel}:{" "}
                    {new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(currentSessionEvent.createdAtIso))}
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

      <section className="rounded-2xl border border-border/70 bg-card/90 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">{labels.eventsTitle}</h3>
            <p className="text-sm text-muted-foreground">{labels.eventsDescription}</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder={labels.searchPlaceholder}
              className="h-9 pl-8"
            />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-background/80 text-xs uppercase tracking-[0.08em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">{labels.columns.date}</th>
                <th className="px-4 py-3 text-left">{labels.columns.event}</th>
                <th className="px-4 py-3 text-left">{labels.columns.ip}</th>
                <th className="px-4 py-3 text-left">{labels.columns.device}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {pagedEvents.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <ShieldAlert className="h-4 w-4" />
                      <span>{labels.noEvents}</span>
                    </div>
                  </td>
                </tr>
              ) : (
                pagedEvents.map((event) => (
                  <tr key={event.id} className="bg-card/40">
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium">
                        {new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
                          dateStyle: "medium",
                        }).format(new Date(event.createdAtIso))}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
                          timeStyle: "medium",
                        }).format(new Date(event.createdAtIso))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${resolveEventColor(event.result, event.action)}`} />
                        <span className="font-medium">{event.actionLabel}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[13px]">{event.ip ?? labels.unknownIp}</td>
                    <td className="px-4 py-3">{event.device}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            {labels.paginationPrev}
          </Button>
          <p className="text-sm text-muted-foreground">
            {labels.paginationPage}: {currentPage} / {totalPages}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            {labels.paginationNext}
          </Button>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          {labels.failures24h}: {auditFailures24h}
        </p>
      </section>
    </div>
  );
}

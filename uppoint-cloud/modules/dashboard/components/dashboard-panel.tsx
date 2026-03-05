import Image from "next/image";
import Link from "next/link";

import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LogoutButton } from "@/modules/auth/components/logout-button";
import { SessionTimeoutWarning } from "@/modules/auth/components/session-timeout-warning";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";

import type { DashboardOverview } from "../server/get-dashboard-overview";

interface DashboardPanelProps {
  locale: Locale;
  dictionary: Dictionary;
  overview: DashboardOverview;
}

function formatDateTime(value: Date | null, locale: Locale): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function renderVerificationStatus(isVerified: boolean, labels: DashboardPanelProps["dictionary"]["dashboard"]["verification"]) {
  return (
    <span
      className={isVerified
        ? "rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"
        : "rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300"}
    >
      {isVerified ? labels.verified : labels.pending}
    </span>
  );
}

function resolveTenantStatusMessage(
  overview: DashboardOverview,
  labels: DashboardPanelProps["dictionary"]["dashboard"]["tenant"],
): string {
  if (overview.tenantErrorCode === "TENANT_NOT_FOUND") {
    return labels.noMembership;
  }

  if (overview.tenantErrorCode === "TENANT_SELECTION_REQUIRED") {
    return labels.selectionRequired;
  }

  return labels.accessDenied;
}

function createTenantHref(locale: Locale, tenantId: string): string {
  return `${withLocale("/dashboard", locale)}?tenantId=${encodeURIComponent(tenantId)}`;
}

export function DashboardPanel({ locale, dictionary, overview }: DashboardPanelProps) {
  const dashboard = dictionary.dashboard;
  const isUserLocked = Boolean(overview.user.lockedUntil && overview.user.lockedUntil > overview.generatedAt);
  const hasNotificationIssues = overview.notifications.failed24h > 0;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <SessionTimeoutWarning
        locale={locale}
        dictionary={dictionary.sessionTimeout}
        sessionExpires={overview.sessionExpiresAt.toISOString()}
      />

      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-border/60 bg-card/70 p-5 backdrop-blur">
          <div className="space-y-4">
            <Image
              src="/logo/uppoint-logo-black.webp"
              alt="Uppoint Cloud"
              width={416}
              height={127}
              className="block h-auto w-[150px] dark:hidden"
            />
            <Image
              src="/logo/Uppoint-logo-wh.webp"
              alt="Uppoint Cloud"
              width={416}
              height={127}
              className="hidden h-auto w-[150px] dark:block"
            />
            <p className="text-sm text-muted-foreground">{dashboard.description}</p>
          </div>

          <nav className="mt-6 space-y-2 text-sm">
            <a href="#overview" className="block rounded-md px-3 py-2 hover:bg-accent">{dashboard.nav.overview}</a>
            <a href="#security" className="block rounded-md px-3 py-2 hover:bg-accent">{dashboard.nav.security}</a>
            <a href="#notifications" className="block rounded-md px-3 py-2 hover:bg-accent">{dashboard.nav.notifications}</a>
            <a href="#tenant" className="block rounded-md px-3 py-2 hover:bg-accent">{dashboard.nav.tenant}</a>
            <a href="#modules" className="block rounded-md px-3 py-2 hover:bg-accent">{dashboard.nav.modules}</a>
          </nav>

          <div className="mt-6 rounded-xl border border-border/60 bg-background/70 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{dashboard.tenant.title}</p>
            {overview.tenant ? (
              <div className="mt-2 space-y-1 text-sm">
                <p><span className="text-muted-foreground">{dashboard.tenant.tenantLabel}:</span> {overview.tenant.tenantId}</p>
                <p><span className="text-muted-foreground">{dashboard.tenant.roleLabel}:</span> {overview.tenant.role}</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {resolveTenantStatusMessage(overview, dashboard.tenant)}
              </p>
            )}
            {overview.tenantOptions.length > 1 ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">{dashboard.tenant.selectorLabel}</p>
                <div className="flex flex-wrap gap-2">
                  {overview.tenantOptions.map((option) => (
                    <Button key={option.tenantId} asChild size="sm" variant={option.isSelected ? "default" : "outline"}>
                      <Link href={createTenantHref(locale, option.tenantId)}>
                        {option.tenantName}
                      </Link>
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-6">
            <LogoutButton locale={locale} label={dictionary.logout.button} />
          </div>
        </aside>

        <section className="space-y-6">
          <header className="rounded-2xl border border-border/60 bg-card/70 p-5 backdrop-blur">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold">{dashboard.title}</h1>
                <p className="text-sm text-muted-foreground">
                  {dashboard.topbar.accountLabel}: {overview.user.email}
                </p>
                <p className="text-xs text-muted-foreground">
                  {dashboard.topbar.updatedAt}: {formatDateTime(overview.generatedAt, locale)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ThemeToggle labels={dictionary.header.theme} iconOnly />
                <LocaleSwitcher locale={locale} labels={dictionary.header.locales} />
              </div>
            </div>
          </header>

          <div id="overview" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{dashboard.session.title}</CardTitle>
                <CardDescription>{dashboard.session.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><span className="text-muted-foreground">{dashboard.session.activeSessions}:</span> {overview.activeSessions}</p>
                <p><span className="text-muted-foreground">{dashboard.session.lastLoginAt}:</span> {formatDateTime(overview.user.lastLoginAt, locale)}</p>
                <p><span className="text-muted-foreground">{dashboard.session.expiresAt}:</span> {formatDateTime(overview.sessionExpiresAt, locale)}</p>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{dashboard.verification.title}</CardTitle>
                <CardDescription>{dashboard.verification.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{dashboard.verification.email}</span>
                  {renderVerificationStatus(Boolean(overview.user.emailVerified), dashboard.verification)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{dashboard.verification.phone}</span>
                  {renderVerificationStatus(Boolean(overview.user.phoneVerifiedAt), dashboard.verification)}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{dashboard.risk.title}</CardTitle>
                <CardDescription>{dashboard.risk.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><span className="text-muted-foreground">{dashboard.risk.failedAttempts}:</span> {overview.user.failedLoginAttempts}</p>
                <p>
                  <span className="text-muted-foreground">{dashboard.risk.lockedUntil}:</span>{" "}
                  {isUserLocked ? formatDateTime(overview.user.lockedUntil, locale) : dashboard.risk.notLocked}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{dashboard.runtime.title}</CardTitle>
                <CardDescription>{dashboard.runtime.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><span className="text-muted-foreground">{dashboard.runtime.rateLimitBackend}:</span> {dashboard.runtime.backends[overview.runtime.rateLimitBackend]}</p>
                <p><span className="text-muted-foreground">{dashboard.runtime.transportMode}:</span> {overview.runtime.internalTransportMode}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card id="notifications" className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">{dashboard.notifications.title}</CardTitle>
                <CardDescription>{dashboard.notifications.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border/50 bg-background/60 p-3">
                    <p className="text-xs text-muted-foreground">{dashboard.notifications.pending}</p>
                    <p className="mt-1 text-lg font-semibold">{overview.notifications.pending}</p>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-background/60 p-3">
                    <p className="text-xs text-muted-foreground">{dashboard.notifications.sent24h}</p>
                    <p className="mt-1 text-lg font-semibold">{overview.notifications.sent24h}</p>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-background/60 p-3">
                    <p className="text-xs text-muted-foreground">{dashboard.notifications.failed24h}</p>
                    <p className="mt-1 text-lg font-semibold">{overview.notifications.failed24h}</p>
                  </div>
                </div>
                <p className={hasNotificationIssues ? "text-amber-600 dark:text-amber-300" : "text-emerald-600 dark:text-emerald-300"}>
                  {hasNotificationIssues ? dashboard.notifications.attention : dashboard.notifications.healthy}
                </p>
              </CardContent>
            </Card>

            <Card id="security" className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">{dashboard.security.title}</CardTitle>
                <CardDescription>{dashboard.security.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>
                  <span className="text-muted-foreground">{dashboard.security.failures24h}:</span> {overview.auditFailures24h}
                </p>
                <div className="space-y-2">
                  {overview.recentAuditEvents.length === 0 ? (
                    <p className="text-muted-foreground">{dashboard.security.noEvents}</p>
                  ) : (
                    overview.recentAuditEvents.map((event) => (
                      <div key={`${event.action}-${event.createdAt.toISOString()}`} className="rounded-lg border border-border/50 bg-background/60 px-3 py-2">
                        <p className="font-medium">{event.action}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(event.createdAt, locale)} · {event.result ?? "UNKNOWN"}{event.reason ? ` · ${event.reason}` : ""}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card id="modules" className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">{dashboard.modules.title}</CardTitle>
              <CardDescription>{dashboard.modules.description}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-border/50 bg-background/60 p-3">
                <p className="font-medium">{dashboard.modules.instances}</p>
                <p className="mt-1 text-xs text-muted-foreground">{dashboard.modules.comingSoon}</p>
              </div>
              <div className="rounded-lg border border-border/50 bg-background/60 p-3">
                <p className="font-medium">{dashboard.modules.network}</p>
                <p className="mt-1 text-xs text-muted-foreground">{dashboard.modules.comingSoon}</p>
              </div>
              <div className="rounded-lg border border-border/50 bg-background/60 p-3">
                <p className="font-medium">{dashboard.modules.backup}</p>
                <p className="mt-1 text-xs text-muted-foreground">{dashboard.modules.comingSoon}</p>
              </div>
              <div className="rounded-lg border border-border/50 bg-background/60 p-3">
                <p className="font-medium">{dashboard.modules.billing}</p>
                <p className="mt-1 text-xs text-muted-foreground">{dashboard.modules.comingSoon}</p>
              </div>
            </CardContent>
          </Card>

          <Card id="tenant" className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">{dashboard.tenant.title}</CardTitle>
              <CardDescription>{dashboard.tenant.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {overview.tenant ? (
                <>
                  <p><span className="text-muted-foreground">{dashboard.tenant.tenantLabel}:</span> {overview.tenant.tenantId}</p>
                  <p><span className="text-muted-foreground">{dashboard.tenant.roleLabel}:</span> {overview.tenant.role}</p>
                </>
              ) : (
                <p className="text-muted-foreground">
                  {resolveTenantStatusMessage(overview, dashboard.tenant)}
                </p>
              )}
              {overview.tenantOptions.length > 0 ? (
                <div className="space-y-2 pt-2">
                  <p className="text-xs text-muted-foreground">{dashboard.tenant.availableTenantsLabel}</p>
                  <div className="space-y-2">
                    {overview.tenantOptions.map((option) => (
                      <div
                        key={`${option.tenantId}-${option.role}`}
                        className={option.isSelected
                          ? "rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2"
                          : "rounded-lg border border-border/50 bg-background/60 px-3 py-2"}
                      >
                        <p className="font-medium">{option.tenantName}</p>
                        <p className="text-xs text-muted-foreground">
                          {dashboard.tenant.tenantLabel}: {option.tenantId} · {dashboard.tenant.roleLabel}: {option.role}
                          {option.isSelected ? ` · ${dashboard.tenant.activeLabel}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">{dashboard.quickActions.title}</CardTitle>
              <CardDescription>{dashboard.quickActions.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link prefetch={false} href={withLocale("/forgot-password", locale)}>
                  {dashboard.quickActions.resetPassword}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link prefetch={false} href={withLocale("/login", locale)}>
                  {dashboard.quickActions.openLogin}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={overview.runtime.appUrl} target="_blank" rel="noreferrer">{dashboard.quickActions.openPublicApp}</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

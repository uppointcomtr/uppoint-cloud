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
import { ProfileMenu } from "./profile-menu";

export type DashboardSection =
  | "overview"
  | "security"
  | "notifications"
  | "tenant"
  | "modules";

interface DashboardPanelProps {
  locale: Locale;
  dictionary: Dictionary;
  overview: DashboardOverview;
  activeSection: DashboardSection;
}

interface NavItem {
  section: DashboardSection;
  label: string;
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

function renderVerificationStatus(
  isVerified: boolean,
  labels: DashboardPanelProps["dictionary"]["dashboard"]["verification"],
) {
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

function resolveDisplayName(name: string | null, email: string): string {
  const trimmedName = name?.trim();
  if (trimmedName) {
    return trimmedName;
  }

  const localPart = email.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  if (!localPart) {
    return email;
  }

  return localPart.replace(/\b\w/g, (char) => char.toUpperCase());
}

function getSectionPath(locale: Locale, section: DashboardSection): string {
  switch (section) {
    case "overview":
      return withLocale("/dashboard", locale);
    case "security":
      return withLocale("/dashboard/security", locale);
    case "notifications":
      return withLocale("/dashboard/notifications", locale);
    case "tenant":
      return withLocale("/dashboard/tenant", locale);
    case "modules":
      return withLocale("/dashboard/modules", locale);
  }
}

function createTenantHref(
  locale: Locale,
  activeSection: DashboardSection,
  tenantId: string,
): string {
  return `${getSectionPath(locale, activeSection)}?tenantId=${encodeURIComponent(tenantId)}`;
}

function navButtonClass(isActive: boolean): string {
  if (isActive) {
    return "block rounded-md bg-accent px-3 py-2 font-medium text-foreground";
  }

  return "block rounded-md px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground";
}

function renderQuickActions(
  locale: Locale,
  labels: DashboardPanelProps["dictionary"]["dashboard"]["quickActions"],
  appUrl: string,
) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base">{labels.title}</CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link prefetch={false} href={withLocale("/forgot-password", locale)}>
            {labels.resetPassword}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link prefetch={false} href={withLocale("/login", locale)}>
            {labels.openLogin}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={appUrl} target="_blank" rel="noreferrer">
            {labels.openPublicApp}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function renderSecurityCard(
  locale: Locale,
  overview: DashboardOverview,
  labels: DashboardPanelProps["dictionary"]["dashboard"]["security"],
) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base">{labels.title}</CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          <span className="text-muted-foreground">{labels.failures24h}:</span> {overview.auditFailures24h}
        </p>
        <div className="space-y-2">
          {overview.recentAuditEvents.length === 0 ? (
            <p className="text-muted-foreground">{labels.noEvents}</p>
          ) : (
            overview.recentAuditEvents.map((event) => (
              <div
                key={`${event.action}-${event.createdAt.toISOString()}`}
                className="rounded-lg border border-border/50 bg-background/60 px-3 py-2"
              >
                <p className="font-medium">{event.action}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(event.createdAt, locale)} · {event.result ?? "UNKNOWN"}
                  {event.reason ? ` · ${event.reason}` : ""}
                </p>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function renderNotificationsCard(
  overview: DashboardOverview,
  labels: DashboardPanelProps["dictionary"]["dashboard"]["notifications"],
) {
  const hasNotificationIssues = overview.notifications.failed24h > 0;

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base">{labels.title}</CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border/50 bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">{labels.pending}</p>
            <p className="mt-1 text-lg font-semibold">{overview.notifications.pending}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">{labels.sent24h}</p>
            <p className="mt-1 text-lg font-semibold">{overview.notifications.sent24h}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">{labels.failed24h}</p>
            <p className="mt-1 text-lg font-semibold">{overview.notifications.failed24h}</p>
          </div>
        </div>
        <p className={hasNotificationIssues ? "text-amber-600 dark:text-amber-300" : "text-emerald-600 dark:text-emerald-300"}>
          {hasNotificationIssues ? labels.attention : labels.healthy}
        </p>
      </CardContent>
    </Card>
  );
}

function renderTenantCard(
  locale: Locale,
  activeSection: DashboardSection,
  overview: DashboardOverview,
  labels: DashboardPanelProps["dictionary"]["dashboard"]["tenant"],
) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base">{labels.title}</CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {overview.tenant ? (
          <>
            <p>
              <span className="text-muted-foreground">{labels.tenantLabel}:</span> {overview.tenant.tenantId}
            </p>
            <p>
              <span className="text-muted-foreground">{labels.roleLabel}:</span> {overview.tenant.role}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">{resolveTenantStatusMessage(overview, labels)}</p>
        )}

        {overview.tenantOptions.length > 0 ? (
          <div className="space-y-2 pt-2">
            <p className="text-xs text-muted-foreground">{labels.availableTenantsLabel}</p>
            <div className="space-y-2">
              {overview.tenantOptions.map((option) => (
                <div
                  key={`${option.tenantId}-${option.role}`}
                  className={option.isSelected
                    ? "rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2"
                    : "rounded-lg border border-border/50 bg-background/60 px-3 py-2"}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{option.tenantName}</p>
                      <p className="text-xs text-muted-foreground">
                        {labels.tenantLabel}: {option.tenantId} · {labels.roleLabel}: {option.role}
                        {option.isSelected ? ` · ${labels.activeLabel}` : ""}
                      </p>
                    </div>
                    {!option.isSelected ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={createTenantHref(locale, activeSection, option.tenantId)}>
                          {labels.selectorLabel}
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function renderModulesCard(
  labels: DashboardPanelProps["dictionary"]["dashboard"]["modules"],
) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base">{labels.title}</CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border/50 bg-background/60 p-3">
          <p className="font-medium">{labels.instances}</p>
          <p className="mt-1 text-xs text-muted-foreground">{labels.comingSoon}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-background/60 p-3">
          <p className="font-medium">{labels.network}</p>
          <p className="mt-1 text-xs text-muted-foreground">{labels.comingSoon}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-background/60 p-3">
          <p className="font-medium">{labels.backup}</p>
          <p className="mt-1 text-xs text-muted-foreground">{labels.comingSoon}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-background/60 p-3">
          <p className="font-medium">{labels.billing}</p>
          <p className="mt-1 text-xs text-muted-foreground">{labels.comingSoon}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function renderOverviewCards(
  locale: Locale,
  overview: DashboardOverview,
  dictionary: DashboardPanelProps["dictionary"]["dashboard"],
) {
  const isUserLocked = Boolean(
    overview.user.lockedUntil && overview.user.lockedUntil > overview.generatedAt,
  );

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{dictionary.session.title}</CardTitle>
          <CardDescription>{dictionary.session.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">{dictionary.session.activeSessions}:</span> {overview.activeSessions}
          </p>
          <p>
            <span className="text-muted-foreground">{dictionary.session.lastLoginAt}:</span>{" "}
            {formatDateTime(overview.user.lastLoginAt, locale)}
          </p>
          <p>
            <span className="text-muted-foreground">{dictionary.session.expiresAt}:</span>{" "}
            {formatDateTime(overview.sessionExpiresAt, locale)}
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{dictionary.verification.title}</CardTitle>
          <CardDescription>{dictionary.verification.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{dictionary.verification.email}</span>
            {renderVerificationStatus(Boolean(overview.user.emailVerified), dictionary.verification)}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{dictionary.verification.phone}</span>
            {renderVerificationStatus(Boolean(overview.user.phoneVerifiedAt), dictionary.verification)}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{dictionary.risk.title}</CardTitle>
          <CardDescription>{dictionary.risk.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">{dictionary.risk.failedAttempts}:</span> {overview.user.failedLoginAttempts}
          </p>
          <p>
            <span className="text-muted-foreground">{dictionary.risk.lockedUntil}:</span>{" "}
            {isUserLocked ? formatDateTime(overview.user.lockedUntil, locale) : dictionary.risk.notLocked}
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{dictionary.runtime.title}</CardTitle>
          <CardDescription>{dictionary.runtime.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">{dictionary.runtime.rateLimitBackend}:</span>{" "}
            {dictionary.runtime.backends[overview.runtime.rateLimitBackend]}
          </p>
          <p>
            <span className="text-muted-foreground">{dictionary.runtime.transportMode}:</span>{" "}
            {overview.runtime.internalTransportMode}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export function DashboardPanel({
  locale,
  dictionary,
  overview,
  activeSection,
}: DashboardPanelProps) {
  const dashboard = dictionary.dashboard;
  const displayName = resolveDisplayName(overview.user.name, overview.user.email);

  const navItems: NavItem[] = [
    { section: "overview", label: dashboard.nav.overview },
    { section: "security", label: dashboard.nav.security },
    { section: "notifications", label: dashboard.nav.notifications },
    { section: "tenant", label: dashboard.nav.tenant },
    { section: "modules", label: dashboard.nav.modules },
  ];

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
            {navItems.map((item) => (
              <Link
                key={item.section}
                href={getSectionPath(locale, item.section)}
                className={navButtonClass(item.section === activeSection)}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-6 rounded-xl border border-border/60 bg-background/70 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{dashboard.tenant.title}</p>
            {overview.tenant ? (
              <div className="mt-2 space-y-1 text-sm">
                <p>
                  <span className="text-muted-foreground">{dashboard.tenant.tenantLabel}:</span> {overview.tenant.tenantId}
                </p>
                <p>
                  <span className="text-muted-foreground">{dashboard.tenant.roleLabel}:</span> {overview.tenant.role}
                </p>
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
                    <Button
                      key={option.tenantId}
                      asChild
                      size="sm"
                      variant={option.isSelected ? "default" : "outline"}
                    >
                      <Link href={createTenantHref(locale, activeSection, option.tenantId)}>
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
              <div className="flex flex-wrap items-center justify-end gap-2">
                <ThemeToggle labels={dictionary.header.theme} iconOnly />
                <LocaleSwitcher locale={locale} labels={dictionary.header.locales} />
                <ProfileMenu
                  locale={locale}
                  dictionary={dashboard.profileMenu}
                  displayName={displayName}
                  email={overview.user.email}
                />
              </div>
            </div>
          </header>

          {activeSection === "overview" ? (
            <>
              {renderOverviewCards(locale, overview, dashboard)}
              {renderQuickActions(locale, dashboard.quickActions, overview.runtime.appUrl)}
            </>
          ) : null}

          {activeSection === "security" ? (
            <>
              {renderSecurityCard(locale, overview, dashboard.security)}
              {renderQuickActions(locale, dashboard.quickActions, overview.runtime.appUrl)}
            </>
          ) : null}

          {activeSection === "notifications" ? (
            <>
              {renderNotificationsCard(overview, dashboard.notifications)}
              {renderQuickActions(locale, dashboard.quickActions, overview.runtime.appUrl)}
            </>
          ) : null}

          {activeSection === "tenant" ? (
            <>
              {renderTenantCard(locale, activeSection, overview, dashboard.tenant)}
              {renderQuickActions(locale, dashboard.quickActions, overview.runtime.appUrl)}
            </>
          ) : null}

          {activeSection === "modules" ? (
            <>
              {renderModulesCard(dashboard.modules)}
              {renderQuickActions(locale, dashboard.quickActions, overview.runtime.appUrl)}
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}

import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Bell, Building2, LayoutDashboard, Layers3, ShieldCheck } from "lucide-react";

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
import { cn } from "@/lib/utils";

import type { DashboardOverview } from "../server/get-dashboard-overview";
import { ProfileMenu } from "./profile-menu";
import { SecurityCenter } from "./security-center";

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
  icon: LucideIcon;
}

const corporateCardClass = "border-border/70 bg-card/90 shadow-sm";

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
  return cn(
    "group flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors",
    isActive
      ? "border-primary/35 bg-primary/[0.14] text-foreground shadow-sm shadow-primary/10"
      : "border-transparent text-muted-foreground hover:border-border/70 hover:bg-accent/65 hover:text-foreground",
  );
}

function renderQuickActions(
  locale: Locale,
  labels: DashboardPanelProps["dictionary"]["dashboard"]["quickActions"],
  appUrl: string,
) {
  return (
    <Card className={corporateCardClass}>
      <CardHeader>
        <CardTitle className="corp-section-title">{labels.title}</CardTitle>
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

function renderNotificationsCard(
  overview: DashboardOverview,
  labels: DashboardPanelProps["dictionary"]["dashboard"]["notifications"],
) {
  const hasNotificationIssues = overview.notifications.failed24h > 0;

  return (
    <Card className={corporateCardClass}>
      <CardHeader>
        <CardTitle className="corp-section-title">{labels.title}</CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border/50 bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">{labels.pending}</p>
            <p className="corp-value mt-1">{overview.notifications.pending}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">{labels.sent24h}</p>
            <p className="corp-value mt-1">{overview.notifications.sent24h}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">{labels.failed24h}</p>
            <p className="corp-value mt-1">{overview.notifications.failed24h}</p>
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
    <Card className={corporateCardClass}>
      <CardHeader>
        <CardTitle className="corp-section-title">{labels.title}</CardTitle>
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
        <CardTitle className="corp-section-title">{labels.title}</CardTitle>
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
      <Card className={corporateCardClass}>
        <CardHeader className="pb-3">
          <CardTitle className="corp-section-title">{dictionary.session.title}</CardTitle>
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

      <Card className={corporateCardClass}>
        <CardHeader className="pb-3">
          <CardTitle className="corp-section-title">{dictionary.verification.title}</CardTitle>
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

      <Card className={corporateCardClass}>
        <CardHeader className="pb-3">
          <CardTitle className="corp-section-title">{dictionary.risk.title}</CardTitle>
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

      <Card className={corporateCardClass}>
        <CardHeader className="pb-3">
          <CardTitle className="corp-section-title">{dictionary.runtime.title}</CardTitle>
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
    { section: "overview", label: dashboard.nav.overview, icon: LayoutDashboard },
    { section: "security", label: dashboard.nav.security, icon: ShieldCheck },
    { section: "notifications", label: dashboard.nav.notifications, icon: Bell },
    { section: "tenant", label: dashboard.nav.tenant, icon: Building2 },
    { section: "modules", label: dashboard.nav.modules, icon: Layers3 },
  ];

  return (
    <main className="relative mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <SessionTimeoutWarning
        locale={locale}
        dictionary={dictionary.sessionTimeout}
        sessionExpires={overview.sessionExpiresAt.toISOString()}
      />

      <div className="grid gap-6 xl:grid-cols-[272px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-border/70 bg-sidebar/95 p-5 shadow-sm shadow-black/5 backdrop-blur xl:sticky xl:top-6 xl:h-[fit-content] dark:bg-sidebar/90">
          <div className="space-y-4 border-b border-border/60 pb-5">
            <Link href={withLocale("/dashboard", locale)} className="inline-block" aria-label="Uppoint Cloud">
              <div className="relative h-12 w-[156px] shrink-0">
                <Image
                  src="/logo/uppoint-logo-black.webp"
                  alt="Uppoint Cloud"
                  width={416}
                  height={127}
                  priority
                  className="absolute inset-0 h-full w-full object-contain dark:hidden"
                />
                <Image
                  src="/logo/Uppoint-logo-wh.webp"
                  alt="Uppoint Cloud"
                  width={416}
                  height={127}
                  priority
                  className="absolute inset-0 hidden h-full w-full object-contain dark:block"
                />
              </div>
            </Link>
            <p className="corp-kicker">Cloud Control Plane</p>
            <p className="text-sm leading-6 text-muted-foreground">{dashboard.description}</p>
          </div>

          <nav className="mt-5 space-y-2 text-sm">
            {navItems.map((item) => (
              <Link
                key={item.section}
                href={getSectionPath(locale, item.section)}
                className={navButtonClass(item.section === activeSection)}
              >
                <item.icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    item.section === activeSection
                      ? "text-primary"
                      : "text-muted-foreground transition-colors group-hover:text-foreground",
                  )}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="mt-6 rounded-xl border border-border/60 bg-background/75 p-4 shadow-sm dark:bg-background/55">
            <p className="corp-kicker">
              {dashboard.tenant.title}
            </p>
            {overview.tenant ? (
              <div className="mt-3 space-y-1 text-sm">
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
              <div className="mt-4 space-y-2">
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
          <header className="relative z-30 overflow-hidden rounded-2xl border border-border/70 bg-sidebar/95 shadow-sm shadow-black/5 backdrop-blur dark:bg-sidebar/90">
            <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2.5">
                <h1 className="corp-heading-1">{dashboard.title}</h1>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-border/70 bg-background/75 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {dashboard.topbar.accountLabel}: {overview.user.email}
                  </span>
                  <span className="rounded-md border border-border/70 bg-background/75 px-2.5 py-1 text-xs text-muted-foreground">
                    {dashboard.topbar.updatedAt}: {formatDateTime(overview.generatedAt, locale)}
                  </span>
                </div>
              </div>
              <div className="flex justify-end">
                <div className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background/80 p-2 shadow-sm dark:bg-background/60">
                  <ThemeToggle
                    labels={dictionary.header.theme}
                    iconOnly
                    className="border-border/80 bg-background/90 dark:bg-background/70"
                  />
                  <LocaleSwitcher
                    locale={locale}
                    labels={dictionary.header.locales}
                    className="border-border/80 bg-background/90 dark:bg-background/70"
                  />
                  <ProfileMenu
                    locale={locale}
                    dictionary={dashboard.profileMenu}
                    displayName={displayName}
                    email={overview.user.email}
                  />
                </div>
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
            <SecurityCenter
              locale={locale}
              labels={dashboard.security}
              activeSessions={overview.activeSessions}
              auditFailures24h={overview.auditFailures24h}
              events={overview.recentAuditEvents.map((event, index) => ({
                id: `${event.action}-${event.createdAt.toISOString()}-${index}`,
                action: event.action,
                result: event.result,
                reason: event.reason,
                ip: event.ip,
                userAgent: event.userAgent,
                createdAtIso: event.createdAt.toISOString(),
              }))}
            />
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

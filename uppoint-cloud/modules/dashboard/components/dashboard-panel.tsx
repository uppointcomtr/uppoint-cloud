import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Bell, Building2, ChevronRight, House, LayoutDashboard, Layers3, ShieldCheck } from "lucide-react";

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
    "group flex items-center gap-2.5 border-l-2 px-3 py-2 text-sm font-medium transition-colors",
    isActive
      ? "border-l-primary bg-primary/[0.09] text-foreground"
      : "border-l-transparent text-muted-foreground hover:bg-accent/45 hover:text-foreground",
  );
}

function getActiveSectionLabel(
  section: DashboardSection,
  nav: { overview: string; security: string; notifications: string; tenant: string; modules: string },
): string {
  const map: Record<DashboardSection, string> = {
    overview: nav.overview,
    security: nav.security,
    notifications: nav.notifications,
    tenant: nav.tenant,
    modules: nav.modules,
  };
  return map[section];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0] ?? "").slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
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

      <div className="grid gap-6 xl:grid-cols-[256px_minmax(0,1fr)]">
        {/* ── Sidebar ── */}
        <aside className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-sidebar shadow-sm shadow-black/5 xl:sticky xl:top-6 xl:h-[fit-content]">
          {/* Logo + brand */}
          <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3.5">
            <Link href={withLocale("/dashboard", locale)} aria-label="Uppoint Cloud" className="shrink-0">
              <div className="relative h-8 w-[108px]">
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
            <div className="h-4 w-px shrink-0 bg-border/60" />
            <span className="corp-kicker leading-none">Control Plane</span>
          </div>

          {/* Nav */}
          <nav className="px-2 py-3 space-y-0.5">
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

          {/* User footer */}
          <div className="mt-auto border-t border-border/50 px-3 py-3">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary text-xs font-bold">
                {getInitials(displayName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-tight text-foreground">{displayName}</p>
                <p className="truncate text-[11px] text-muted-foreground mt-0.5">{overview.user.email}</p>
              </div>
              <LogoutButton locale={locale} label={dictionary.logout.button} iconOnly />
            </div>
          </div>
        </aside>

        <section className="space-y-6">
          {/* ── Top bar ── */}
          <header className="relative z-30 rounded-xl border border-border/60 bg-sidebar shadow-sm shadow-black/5">
            <div className="flex h-14 items-center justify-between px-5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-5 w-0.5 shrink-0 rounded-full bg-primary" />
                <Link
                  href={withLocale("/dashboard", locale)}
                  aria-label={dashboard.title}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <House className="h-4 w-4" />
                </Link>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-border" aria-hidden />
                <span className="truncate text-sm font-semibold text-foreground">
                  {getActiveSectionLabel(activeSection, dashboard.nav)}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1 ml-4">
                <ThemeToggle
                  labels={dictionary.header.theme}
                  iconOnly
                  className="border-border/70 bg-background/80 dark:bg-background/60"
                />
                <div className="h-4 w-px bg-border/60 mx-0.5" />
                <LocaleSwitcher
                  locale={locale}
                  labels={dictionary.header.locales}
                  className="border-border/70 bg-background/80 dark:bg-background/60"
                />
                <div className="h-4 w-px bg-border/60 mx-0.5" />
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
                requestId: event.requestId,
                ip: event.ip,
                userAgent: event.userAgent,
                createdAtIso: event.createdAt.toISOString(),
              }))}
              currentSession={{
                ip: overview.currentSession.ip,
                userAgent: overview.currentSession.userAgent,
                observedAtIso: overview.currentSession.observedAt.toISOString(),
                loginAtIso: overview.currentSession.loginAt?.toISOString() ?? null,
              }}
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

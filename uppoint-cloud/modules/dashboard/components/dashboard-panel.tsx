import type { ElementType } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  Building2,
  CheckCircle2,
  CreditCard,
  Cpu,
  Database,
  Globe,
  LayoutDashboard,
  Monitor,
  Server,
  ShieldCheck,
} from "lucide-react";

import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
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
  icon: ElementType;
}

type StatusColor = "green" | "amber" | "red" | "muted";

const STATUS_DOT_CLASS: Record<StatusColor, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  muted: "bg-muted-foreground/30",
};

function formatDateTime(value: Date | null, locale: Locale): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function resolveDisplayName(name: string | null, email: string): string {
  const trimmedName = name?.trim();
  if (trimmedName) return trimmedName;
  const localPart = email.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  if (!localPart) return email;
  return localPart.replace(/\b\w/g, (c) => c.toUpperCase());
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getSectionPath(locale: Locale, section: DashboardSection): string {
  switch (section) {
    case "overview": return withLocale("/dashboard", locale);
    case "security": return withLocale("/dashboard/security", locale);
    case "notifications": return withLocale("/dashboard/notifications", locale);
    case "tenant": return withLocale("/dashboard/tenant", locale);
    case "modules": return withLocale("/dashboard/modules", locale);
  }
}

function createTenantHref(locale: Locale, section: DashboardSection, tenantId: string): string {
  return `${getSectionPath(locale, section)}?tenantId=${encodeURIComponent(tenantId)}`;
}

function resolveTenantStatusMessage(
  overview: DashboardOverview,
  labels: Dictionary["dashboard"]["tenant"],
): string {
  if (overview.tenantErrorCode === "TENANT_NOT_FOUND") return labels.noMembership;
  if (overview.tenantErrorCode === "TENANT_SELECTION_REQUIRED") return labels.selectionRequired;
  return labels.accessDenied;
}

function eventResultColor(result: string | null | undefined): StatusColor {
  if (!result) return "muted";
  if (result === "SUCCESS") return "green";
  if (result === "FAILURE" || result === "BLOCKED") return "red";
  return "amber";
}

// ── Primitives ───────────────────────────────────────────────────────────────

function StatusDot({ color }: { color: StatusColor }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_CLASS[color]}`}
      aria-hidden
    />
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  status,
}: {
  icon: ElementType;
  label: string;
  value: string | number;
  sub?: string;
  status: StatusColor;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <StatusDot color={status} />
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums leading-none">{value}</p>
      {sub ? <p className="mt-1.5 truncate text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

// ── Section renders ──────────────────────────────────────────────────────────

function renderOverview(locale: Locale, overview: DashboardOverview, labels: Dictionary["dashboard"]) {
  const riskStatus: StatusColor =
    overview.user.failedLoginAttempts === 0 ? "green"
    : overview.user.failedLoginAttempts < 3 ? "amber"
    : "red";

  const backendStatus: StatusColor =
    overview.runtime.rateLimitBackend !== "prisma-fallback" ? "green" : "amber";

  return (
    <div className="space-y-5">
      {/* KPI tiles */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={Monitor}
          label={labels.session.activeSessions}
          value={overview.activeSessions}
          sub={`${labels.session.expiresAt}: ${formatDateTime(overview.sessionExpiresAt, locale)}`}
          status={overview.activeSessions > 0 ? "green" : "muted"}
        />
        <StatTile
          icon={CheckCircle2}
          label={labels.verification.email}
          value={overview.user.emailVerified ? labels.verification.verified : labels.verification.pending}
          sub={`${labels.verification.phone}: ${overview.user.phoneVerifiedAt ? labels.verification.verified : labels.verification.pending}`}
          status={overview.user.emailVerified ? "green" : "amber"}
        />
        <StatTile
          icon={AlertTriangle}
          label={labels.risk.failedAttempts}
          value={overview.user.failedLoginAttempts}
          sub={
            overview.user.lockedUntil && overview.user.lockedUntil > overview.generatedAt
              ? `${labels.risk.lockedUntil}: ${formatDateTime(overview.user.lockedUntil, locale)}`
              : labels.risk.notLocked
          }
          status={riskStatus}
        />
        <StatTile
          icon={Cpu}
          label={labels.runtime.rateLimitBackend}
          value={labels.runtime.backends[overview.runtime.rateLimitBackend]}
          sub={overview.runtime.internalTransportMode}
          status={backendStatus}
        />
      </div>

      {/* Recent audit events */}
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
          <h2 className="text-sm font-semibold">{labels.security.title}</h2>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {overview.auditFailures24h} {labels.security.failures24h}
          </span>
        </div>
        <div className="divide-y divide-border/40">
          {overview.recentAuditEvents.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">{labels.security.noEvents}</p>
          ) : (
            overview.recentAuditEvents.map((event) => (
              <div
                key={`${event.action}-${event.createdAt.toISOString()}`}
                className="flex items-center gap-3 px-5 py-2.5"
              >
                <StatusDot color={eventResultColor(event.result)} />
                <span className="flex-1 truncate font-mono text-xs text-foreground/80">{event.action}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDateTime(event.createdAt, locale)}
                  {event.result ? ` · ${event.result}` : ""}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Notification summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border/60 bg-card p-4 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{labels.notifications.pending}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{overview.notifications.pending}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{labels.notifications.sent24h}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{overview.notifications.sent24h}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{labels.notifications.failed24h}</p>
          <p className={`mt-2 text-2xl font-bold tabular-nums ${overview.notifications.failed24h > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
            {overview.notifications.failed24h}
          </p>
        </div>
      </div>
    </div>
  );
}

function renderSecurity(locale: Locale, overview: DashboardOverview, labels: Dictionary["dashboard"]) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile
          icon={ShieldCheck}
          label={labels.security.failures24h}
          value={overview.auditFailures24h}
          status={overview.auditFailures24h === 0 ? "green" : "amber"}
        />
        <StatTile
          icon={AlertTriangle}
          label={labels.risk.failedAttempts}
          value={overview.user.failedLoginAttempts}
          sub={
            overview.user.lockedUntil && overview.user.lockedUntil > overview.generatedAt
              ? `${labels.risk.lockedUntil}: ${formatDateTime(overview.user.lockedUntil, locale)}`
              : labels.risk.notLocked
          }
          status={overview.user.failedLoginAttempts === 0 ? "green" : overview.user.failedLoginAttempts < 3 ? "amber" : "red"}
        />
      </div>

      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <div className="border-b border-border/60 px-5 py-3.5">
          <h2 className="text-sm font-semibold">{labels.security.title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{labels.security.description}</p>
        </div>
        <div className="divide-y divide-border/40">
          {overview.recentAuditEvents.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">{labels.security.noEvents}</p>
          ) : (
            overview.recentAuditEvents.map((event) => (
              <div
                key={`${event.action}-${event.createdAt.toISOString()}`}
                className="flex items-center gap-3 px-5 py-3"
              >
                <StatusDot color={eventResultColor(event.result)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-foreground/80">{event.action}</p>
                  {event.reason ? <p className="text-xs text-muted-foreground">{event.reason}</p> : null}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(event.createdAt, locale)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function renderNotifications(overview: DashboardOverview, labels: Dictionary["dashboard"]) {
  const hasIssues = overview.notifications.failed24h > 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{labels.notifications.pending}</p>
          <p className="mt-3 text-3xl font-bold tabular-nums">{overview.notifications.pending}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{labels.notifications.sent24h}</p>
          <p className="mt-3 text-3xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{overview.notifications.sent24h}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{labels.notifications.failed24h}</p>
          <p className={`mt-3 text-3xl font-bold tabular-nums ${hasIssues ? "text-red-600 dark:text-red-400" : ""}`}>
            {overview.notifications.failed24h}
          </p>
        </div>
      </div>

      <div className={`flex items-center gap-3 rounded-xl border px-5 py-4 text-sm font-medium ${
        hasIssues
          ? "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300"
          : "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
      }`}>
        <StatusDot color={hasIssues ? "amber" : "green"} />
        {hasIssues ? labels.notifications.attention : labels.notifications.healthy}
      </div>
    </div>
  );
}

function renderTenant(locale: Locale, section: DashboardSection, overview: DashboardOverview, labels: Dictionary["dashboard"]) {
  return (
    <div className="space-y-4">
      <div className={`rounded-xl border p-5 ${overview.tenant ? "border-border/60 bg-card" : "border-amber-500/30 bg-amber-500/5"}`}>
        <div className="mb-3 flex items-center gap-2">
          <StatusDot color={overview.tenant ? "green" : "amber"} />
          <h2 className="text-sm font-semibold">{labels.tenant.title}</h2>
        </div>
        {overview.tenant ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{labels.tenant.tenantLabel}</span>
              <span className="font-mono text-xs">{overview.tenant.tenantId}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{labels.tenant.roleLabel}</span>
              <span className="font-medium">{overview.tenant.role}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{resolveTenantStatusMessage(overview, labels.tenant)}</p>
        )}
      </div>

      {overview.tenantOptions.length > 0 ? (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <div className="border-b border-border/60 px-5 py-3.5">
            <h2 className="text-sm font-semibold">{labels.tenant.availableTenantsLabel}</h2>
          </div>
          <div className="divide-y divide-border/40">
            {overview.tenantOptions.map((option) => (
              <div
                key={`${option.tenantId}-${option.role}`}
                className="flex items-center justify-between gap-4 px-5 py-3.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <StatusDot color={option.isSelected ? "green" : "muted"} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{option.tenantName}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{option.tenantId} · {option.role}</p>
                  </div>
                </div>
                {option.isSelected ? (
                  <span className="shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    {labels.tenant.activeLabel}
                  </span>
                ) : (
                  <Button asChild size="sm" variant="outline" className="shrink-0">
                    <Link href={createTenantHref(locale, section, option.tenantId)}>
                      {labels.tenant.selectorLabel}
                    </Link>
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function renderModules(labels: Dictionary["dashboard"]) {
  const moduleItems = [
    { label: labels.modules.instances, icon: Server },
    { label: labels.modules.network, icon: Globe },
    { label: labels.modules.backup, icon: Database },
    { label: labels.modules.billing, icon: CreditCard },
  ];

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="border-b border-border/60 px-5 py-3.5">
        <h2 className="text-sm font-semibold">{labels.modules.title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{labels.modules.description}</p>
      </div>
      <div className="grid gap-px bg-border/40 sm:grid-cols-2 xl:grid-cols-4">
        {moduleItems.map(({ label, icon: Icon }) => (
          <div key={label} className="flex flex-col gap-3 bg-card p-5">
            <div className="flex items-center justify-between">
              <Icon className="h-5 w-5 text-muted-foreground/50" />
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {labels.modules.comingSoon}
              </span>
            </div>
            <p className="text-sm font-medium">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function DashboardPanel({ locale, dictionary, overview, activeSection }: DashboardPanelProps) {
  const dashboard = dictionary.dashboard;
  const displayName = resolveDisplayName(overview.user.name, overview.user.email);
  const initials = getInitials(displayName);

  const navItems: NavItem[] = [
    { section: "overview", label: dashboard.nav.overview, icon: LayoutDashboard },
    { section: "security", label: dashboard.nav.security, icon: ShieldCheck },
    { section: "notifications", label: dashboard.nav.notifications, icon: Bell },
    { section: "tenant", label: dashboard.nav.tenant, icon: Building2 },
    { section: "modules", label: dashboard.nav.modules, icon: Server },
  ];

  const activeNavItem = navItems.find((n) => n.section === activeSection);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <SessionTimeoutWarning
        locale={locale}
        dictionary={dictionary.sessionTimeout}
        sessionExpires={overview.sessionExpiresAt.toISOString()}
      />

      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside className="hidden xl:flex xl:w-56 xl:shrink-0 xl:flex-col border-r border-border/60">
        {/* Logo — same height as topbar */}
        <div className="flex h-14 shrink-0 items-center border-b border-border/60 px-5">
          <Link href={withLocale("/dashboard", locale)} aria-label="Uppoint Cloud">
            <div className="relative h-7 w-[110px]">
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
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {navItems.map(({ section, label, icon: Icon }) => {
            const isActive = section === activeSection;
            return (
              <Link
                key={section}
                href={getSectionPath(locale, section)}
                className={
                  isActive
                    ? "flex items-center gap-2.5 rounded-lg bg-primary/10 px-3 py-2 text-sm font-semibold text-primary"
                    : "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Active tenant badge */}
        {overview.tenant ? (
          <div className="mx-3 mb-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5">
            <div className="mb-1 flex items-center gap-1.5">
              <StatusDot color="green" />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {dashboard.tenant.title}
              </p>
            </div>
            <p className="truncate text-sm font-medium">{overview.tenant.tenantId}</p>
            <p className="text-xs text-muted-foreground">{overview.tenant.role}</p>
          </div>
        ) : null}

        {/* User + logout */}
        <div className="border-t border-border/60 p-3">
          <div className="mb-2 flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-tight">{displayName}</p>
              <p className="truncate text-xs leading-tight text-muted-foreground">{overview.user.email}</p>
            </div>
          </div>
          <LogoutButton locale={locale} label={dictionary.logout.button} />
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 px-4 sm:px-6">
          <span className="text-sm font-semibold">
            {activeNavItem ? activeNavItem.label : dashboard.title}
          </span>
          <div className="flex items-center gap-2">
            <ThemeToggle
              labels={dictionary.header.theme}
              iconOnly
              className="border-border/60"
            />
            <LocaleSwitcher
              locale={locale}
              labels={dictionary.header.locales}
              className="border-border/60"
            />
            <ProfileMenu
              locale={locale}
              dictionary={dashboard.profileMenu}
              displayName={displayName}
              email={overview.user.email}
            />
          </div>
        </header>

        {/* Mobile nav — visible below xl */}
        <nav className="flex gap-1 overflow-x-auto border-b border-border/60 px-3 py-1.5 xl:hidden">
          {navItems.map(({ section, label, icon: Icon }) => {
            const isActive = section === activeSection;
            return (
              <Link
                key={section}
                href={getSectionPath(locale, section)}
                className={
                  isActive
                    ? "flex shrink-0 items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
                    : "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
            {activeSection === "overview" ? renderOverview(locale, overview, dashboard) : null}
            {activeSection === "security" ? renderSecurity(locale, overview, dashboard) : null}
            {activeSection === "notifications" ? renderNotifications(overview, dashboard) : null}
            {activeSection === "tenant" ? renderTenant(locale, activeSection, overview, dashboard) : null}
            {activeSection === "modules" ? renderModules(dashboard) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

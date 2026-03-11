import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Bell, Building2, ChevronRight, House, LayoutDashboard, Layers3, ShieldCheck } from "lucide-react";

import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { LogoutButton } from "@/modules/auth/components/logout-button";
import { SessionTimeoutWarning } from "@/modules/auth/components/session-timeout-warning";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";
import { cn } from "@/lib/utils";

import type { DashboardOverview } from "../server/get-dashboard-overview";
import {
  ModulesCard,
  NotificationsCard,
  OverviewCards,
  QuickActionsCard,
  TenantCard,
  type DashboardActiveSection,
} from "./dashboard-section-cards";
import { ProfileMenu } from "./profile-menu";
import { SecurityCenter } from "./security-center";

export type DashboardSection = DashboardActiveSection;

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
              <OverviewCards locale={locale} overview={overview} labels={dashboard} />
              <QuickActionsCard locale={locale} overview={overview} labels={dashboard} />
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
              <NotificationsCard overview={overview} labels={dashboard} />
              <QuickActionsCard locale={locale} overview={overview} labels={dashboard} />
            </>
          ) : null}

          {activeSection === "tenant" ? (
            <>
              <TenantCard locale={locale} activeSection={activeSection} overview={overview} labels={dashboard} />
              <QuickActionsCard locale={locale} overview={overview} labels={dashboard} />
            </>
          ) : null}

          {activeSection === "modules" ? (
            <>
              <ModulesCard labels={dashboard} />
              <QuickActionsCard locale={locale} overview={overview} labels={dashboard} />
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}

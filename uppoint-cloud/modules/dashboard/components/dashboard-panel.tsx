import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Bell, Building2, ChevronRight, House, LayoutDashboard, Layers3, ShieldCheck, UserCircle2 } from "lucide-react";

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
  TenantCard,
  type DashboardActiveSection,
} from "./dashboard-section-cards";
import { AccountCenter } from "./account-center";
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
    case "account":
      return withLocale("/dashboard/account", locale);
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
    "group flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-150 ease-out",
    isActive
      ? "border-primary/20 bg-primary/10 text-foreground shadow-sm shadow-primary/5"
      : "border-transparent text-muted-foreground hover:border-border/70 hover:bg-background/80 hover:text-foreground hover:shadow-sm",
  );
}

function getActiveSectionLabel(
  section: DashboardSection,
  nav: { overview: string; account: string; security: string; notifications: string; tenant: string; modules: string },
): string {
  const map: Record<DashboardSection, string> = {
    overview: nav.overview,
    account: nav.account,
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
    { section: "account", label: dashboard.nav.account, icon: UserCircle2 },
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
                  unoptimized
                  className="absolute inset-0 h-full w-full object-contain dark:hidden"
                />
                <Image
                  src="/logo/Uppoint-logo-wh.webp"
                  alt="Uppoint Cloud"
                  width={416}
                  height={127}
                  priority
                  unoptimized
                  className="absolute inset-0 hidden h-full w-full object-contain dark:block"
                />
              </div>
            </Link>
            <div className="h-4 w-px shrink-0 bg-border/60" />
            <span className="corp-kicker leading-none">CLOUD PANEL</span>
          </div>

          {/* Nav */}
          <nav className="px-2 py-3 space-y-0.5">
            {navItems.map((item) => (
              <Link key={item.section} href={getSectionPath(locale, item.section)} className={navButtonClass(item.section === activeSection)}>
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-md transition-[background-color,color] duration-150 ease-out",
                    item.section === activeSection
                      ? "bg-primary/12 text-primary"
                      : "text-muted-foreground group-hover:bg-accent group-hover:text-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                </span>
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
              <LogoutButton locale={locale} labels={dictionary.logout} iconOnly />
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
                  className="border-border/70 bg-background/80 shadow-none transition-[background-color,border-color,color,box-shadow] duration-150 ease-out hover:border-border hover:bg-background dark:bg-background/60"
                />
                <div className="h-4 w-px bg-border/60 mx-0.5" />
                <LocaleSwitcher
                  locale={locale}
                  labels={dictionary.header.locales}
                  className="border-border/70 bg-background/80 shadow-none transition-[background-color,border-color,color,box-shadow] duration-150 ease-out hover:border-border hover:bg-background dark:bg-background/60"
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
            </>
          ) : null}

          {activeSection === "account" ? (
            <AccountCenter
              locale={locale}
              labels={dashboard.account}
              passwordRecoveryLabels={dictionary.passwordRecovery}
              validationLabels={dictionary.validation}
              user={{
                name: overview.user.name,
                email: overview.user.email,
                phone: overview.user.phone,
                createdAt: overview.user.createdAt.toISOString(),
                emailVerified: overview.user.emailVerified?.toISOString() ?? null,
                phoneVerifiedAt: overview.user.phoneVerifiedAt?.toISOString() ?? null,
              }}
            />
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
            </>
          ) : null}

          {activeSection === "tenant" ? (
            <>
              <TenantCard locale={locale} activeSection={activeSection} overview={overview} labels={dashboard} />
            </>
          ) : null}

          {activeSection === "modules" ? (
            <>
              <ModulesCard labels={dashboard} />
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}

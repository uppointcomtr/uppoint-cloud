import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Bell, Building2, LayoutDashboard, Layers3, ShieldCheck, UserCircle2 } from "lucide-react";

import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { LogoutButton } from "@/modules/auth/components/logout-button";
import { SessionTimeoutWarning } from "@/modules/auth/components/session-timeout-warning";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";
import { cn } from "@/lib/utils";
import type { TenantCreateAction } from "@/modules/tenant/components/tenant-create-form";

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
  modulesContent?: ReactNode;
  tenantContent?: ReactNode;
  createTenantAction?: TenantCreateAction;
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

function appendTenantContext(path: string, tenantId: string | null | undefined): string {
  if (!tenantId) {
    return path;
  }

  return `${path}?tenantId=${encodeURIComponent(tenantId)}`;
}

function getSectionPath(locale: Locale, section: DashboardSection, tenantId?: string | null): string {
  switch (section) {
    case "overview":
      return appendTenantContext(withLocale("/dashboard", locale), tenantId);
    case "account":
      return appendTenantContext(withLocale("/dashboard/account", locale), tenantId);
    case "security":
      return appendTenantContext(withLocale("/dashboard/security", locale), tenantId);
    case "notifications":
      return appendTenantContext(withLocale("/dashboard/notifications", locale), tenantId);
    case "tenant":
      return appendTenantContext(withLocale("/dashboard/tenant", locale), tenantId);
    case "modules":
      return appendTenantContext(withLocale("/dashboard/modules", locale), tenantId);
  }
}

function navButtonClass(isActive: boolean): string {
  return cn(
    "group",
    "corp-nav-item",
    isActive ? "corp-nav-item-active" : "corp-nav-item-idle",
  );
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
  modulesContent,
  tenantContent,
  createTenantAction,
}: DashboardPanelProps) {
  const dashboard = dictionary.dashboard;
  const displayName = resolveDisplayName(overview.user.name, overview.user.email);
  const activeTenantId = overview.tenant?.tenantId ?? null;
  const dashboardHomePath = getSectionPath(locale, "overview", activeTenantId);

  const navItems: NavItem[] = [
    { section: "overview", label: dashboard.nav.overview, icon: LayoutDashboard },
    { section: "account", label: dashboard.nav.account, icon: UserCircle2 },
    { section: "security", label: dashboard.nav.security, icon: ShieldCheck },
    { section: "notifications", label: dashboard.nav.notifications, icon: Bell },
    { section: "tenant", label: dashboard.nav.tenant, icon: Building2 },
    { section: "modules", label: dashboard.nav.modules, icon: Layers3 },
  ];
  const activeNavItem = navItems.find((item) => item.section === activeSection) ?? navItems[0];
  const ActiveSectionIcon = activeNavItem.icon;

  return (
    <main className="corp-dashboard-shell">
      <SessionTimeoutWarning
        locale={locale}
        dictionary={dictionary.sessionTimeout}
        sessionExpires={overview.sessionExpiresAt.toISOString()}
      />

      <div className="grid gap-6 xl:grid-cols-[256px_minmax(0,1fr)]">
        {/* ── Sidebar ── */}
        <aside className="corp-nav-surface flex flex-col overflow-hidden xl:sticky xl:top-6 xl:h-[fit-content]">
          {/* Logo + brand */}
          <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3.5">
            <Link href={dashboardHomePath} aria-label="Uppoint Cloud" className="shrink-0">
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
              <Link key={item.section} href={getSectionPath(locale, item.section, activeTenantId)} className={navButtonClass(item.section === activeSection)}>
                <span
                  className={cn(
                    "corp-motion-interactive flex size-7 shrink-0 items-center justify-center rounded-md",
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
                <p className="corp-title-base truncate leading-tight">{displayName}</p>
                <p className="corp-field-hint mt-0.5 truncate">{overview.user.email}</p>
              </div>
              <LogoutButton locale={locale} labels={dictionary.logout} iconOnly />
            </div>
          </div>
        </aside>

        <section className="corp-section-stack">
          {/* ── Top bar ── */}
          <header className="corp-topbar">
            <div className="corp-topbar-inner">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-5 w-0.5 shrink-0 rounded-full bg-primary" />
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <ActiveSectionIcon className="h-4 w-4" />
                </span>
                <span className="truncate text-sm font-semibold text-foreground">
                  {activeNavItem.label}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1 ml-4">
                <ThemeToggle
                  labels={dictionary.header.theme}
                  iconOnly
                  className="corp-toolbar-btn"
                />
                <div className="corp-toolbar-divider" />
                <LocaleSwitcher
                  locale={locale}
                  labels={dictionary.header.locales}
                  className="corp-toolbar-btn"
                />
                <div className="corp-toolbar-divider" />
                <ProfileMenu
                  locale={locale}
                  dictionary={dashboard.profileMenu}
                  displayName={displayName}
                  email={overview.user.email}
                  activeTenantId={activeTenantId}
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
              {tenantContent ?? (
                <TenantCard
                  locale={locale}
                  activeSection={activeSection}
                  overview={overview}
                  labels={dashboard}
                  createTenantAction={createTenantAction}
                />
              )}
            </>
          ) : null}

          {activeSection === "modules" ? (
            <>
              {modulesContent ?? <ModulesCard locale={locale} overview={overview} labels={dashboard} activeTenantId={activeTenantId} />}
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";

import type { DashboardOverview } from "../server/get-dashboard-overview";

const corporateCardClass = "border-border/70 bg-card/90 shadow-sm";

export type DashboardActiveSection = "overview" | "security" | "notifications" | "tenant" | "modules";

interface DashboardSectionProps {
  locale: Locale;
  overview: DashboardOverview;
  labels: Dictionary["dashboard"];
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
  labels: Dictionary["dashboard"]["verification"],
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
  labels: Dictionary["dashboard"]["tenant"],
): string {
  if (overview.tenantErrorCode === "TENANT_NOT_FOUND") {
    return labels.noMembership;
  }

  if (overview.tenantErrorCode === "TENANT_SELECTION_REQUIRED") {
    return labels.selectionRequired;
  }

  return labels.accessDenied;
}

function createTenantHref(
  locale: Locale,
  activeSection: DashboardActiveSection,
  tenantId: string,
): string {
  const sectionPath: Record<DashboardActiveSection, string> = {
    overview: "/dashboard",
    security: "/dashboard/security",
    notifications: "/dashboard/notifications",
    tenant: "/dashboard/tenant",
    modules: "/dashboard/modules",
  };

  return `${withLocale(sectionPath[activeSection], locale)}?tenantId=${encodeURIComponent(tenantId)}`;
}

export function OverviewCards({ locale, overview, labels }: DashboardSectionProps) {
  const isUserLocked = Boolean(
    overview.user.lockedUntil && overview.user.lockedUntil > overview.generatedAt,
  );

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card className={corporateCardClass}>
        <CardHeader className="pb-3">
          <CardTitle className="corp-section-title">{labels.session.title}</CardTitle>
          <CardDescription>{labels.session.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">{labels.session.activeSessions}:</span> {overview.activeSessions}
          </p>
          <p>
            <span className="text-muted-foreground">{labels.session.lastLoginAt}:</span>{" "}
            {formatDateTime(overview.user.lastLoginAt, locale)}
          </p>
          <p>
            <span className="text-muted-foreground">{labels.session.expiresAt}:</span>{" "}
            {formatDateTime(overview.sessionExpiresAt, locale)}
          </p>
        </CardContent>
      </Card>

      <Card className={corporateCardClass}>
        <CardHeader className="pb-3">
          <CardTitle className="corp-section-title">{labels.verification.title}</CardTitle>
          <CardDescription>{labels.verification.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{labels.verification.email}</span>
            {renderVerificationStatus(Boolean(overview.user.emailVerified), labels.verification)}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{labels.verification.phone}</span>
            {renderVerificationStatus(Boolean(overview.user.phoneVerifiedAt), labels.verification)}
          </div>
        </CardContent>
      </Card>

      <Card className={corporateCardClass}>
        <CardHeader className="pb-3">
          <CardTitle className="corp-section-title">{labels.risk.title}</CardTitle>
          <CardDescription>{labels.risk.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">{labels.risk.failedAttempts}:</span> {overview.user.failedLoginAttempts}
          </p>
          <p>
            <span className="text-muted-foreground">{labels.risk.lockedUntil}:</span>{" "}
            {isUserLocked ? formatDateTime(overview.user.lockedUntil, locale) : labels.risk.notLocked}
          </p>
        </CardContent>
      </Card>

      <Card className={corporateCardClass}>
        <CardHeader className="pb-3">
          <CardTitle className="corp-section-title">{labels.runtime.title}</CardTitle>
          <CardDescription>{labels.runtime.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">{labels.runtime.rateLimitBackend}:</span>{" "}
            {labels.runtime.backends[overview.runtime.rateLimitBackend]}
          </p>
          <p>
            <span className="text-muted-foreground">{labels.runtime.transportMode}:</span>{" "}
            {overview.runtime.internalTransportMode}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export function QuickActionsCard({ locale, overview, labels }: DashboardSectionProps) {
  return (
    <Card className={corporateCardClass}>
      <CardHeader>
        <CardTitle className="corp-section-title">{labels.quickActions.title}</CardTitle>
        <CardDescription>{labels.quickActions.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link prefetch={false} href={withLocale("/forgot-password", locale)}>
            {labels.quickActions.resetPassword}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link prefetch={false} href={withLocale("/login", locale)}>
            {labels.quickActions.openLogin}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={overview.runtime.appUrl} target="_blank" rel="noreferrer">
            {labels.quickActions.openPublicApp}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function NotificationsCard({ overview, labels }: Pick<DashboardSectionProps, "overview" | "labels">) {
  const hasNotificationIssues = overview.notifications.failed24h > 0;

  return (
    <Card className={corporateCardClass}>
      <CardHeader>
        <CardTitle className="corp-section-title">{labels.notifications.title}</CardTitle>
        <CardDescription>{labels.notifications.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border/50 bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">{labels.notifications.pending}</p>
            <p className="corp-value mt-1">{overview.notifications.pending}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">{labels.notifications.sent24h}</p>
            <p className="corp-value mt-1">{overview.notifications.sent24h}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">{labels.notifications.failed24h}</p>
            <p className="corp-value mt-1">{overview.notifications.failed24h}</p>
          </div>
        </div>
        <p className={hasNotificationIssues ? "text-amber-600 dark:text-amber-300" : "text-emerald-600 dark:text-emerald-300"}>
          {hasNotificationIssues ? labels.notifications.attention : labels.notifications.healthy}
        </p>
      </CardContent>
    </Card>
  );
}

export function TenantCard({
  locale,
  activeSection,
  overview,
  labels,
}: {
  locale: Locale;
  activeSection: DashboardActiveSection;
  overview: DashboardOverview;
  labels: Dictionary["dashboard"];
}) {
  return (
    <Card className={corporateCardClass}>
      <CardHeader>
        <CardTitle className="corp-section-title">{labels.tenant.title}</CardTitle>
        <CardDescription>{labels.tenant.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {overview.tenant ? (
          <>
            <p>
              <span className="text-muted-foreground">{labels.tenant.tenantLabel}:</span> {overview.tenant.tenantId}
            </p>
            <p>
              <span className="text-muted-foreground">{labels.tenant.roleLabel}:</span> {overview.tenant.role}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">{resolveTenantStatusMessage(overview, labels.tenant)}</p>
        )}

        {overview.tenantOptions.length > 0 ? (
          <div className="space-y-2 pt-2">
            <p className="text-xs text-muted-foreground">{labels.tenant.availableTenantsLabel}</p>
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
                        {labels.tenant.tenantLabel}: {option.tenantId} · {labels.tenant.roleLabel}: {option.role}
                        {option.isSelected ? ` · ${labels.tenant.activeLabel}` : ""}
                      </p>
                    </div>
                    {!option.isSelected ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={createTenantHref(locale, activeSection, option.tenantId)}>
                          {labels.tenant.selectorLabel}
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

export function ModulesCard({ labels }: Pick<DashboardSectionProps, "labels">) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="corp-section-title">{labels.modules.title}</CardTitle>
        <CardDescription>{labels.modules.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border/50 bg-background/60 p-3">
          <p className="font-medium">{labels.modules.instances}</p>
          <p className="mt-1 text-xs text-muted-foreground">{labels.modules.comingSoon}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-background/60 p-3">
          <p className="font-medium">{labels.modules.network}</p>
          <p className="mt-1 text-xs text-muted-foreground">{labels.modules.comingSoon}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-background/60 p-3">
          <p className="font-medium">{labels.modules.backup}</p>
          <p className="mt-1 text-xs text-muted-foreground">{labels.modules.comingSoon}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-background/60 p-3">
          <p className="font-medium">{labels.modules.billing}</p>
          <p className="mt-1 text-xs text-muted-foreground">{labels.modules.comingSoon}</p>
        </div>
      </CardContent>
    </Card>
  );
}

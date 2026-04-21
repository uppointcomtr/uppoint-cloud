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
import { TenantCreateForm, type TenantCreateAction } from "@/modules/tenant/components/tenant-create-form";

import type { DashboardOverview } from "../server/get-dashboard-overview";

const corporateCardClass = "corp-surface";

export type DashboardActiveSection = "overview" | "account" | "security" | "notifications" | "tenant" | "modules";

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

function formatDate(value: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
    dateStyle: "medium",
  }).format(value);
}

function renderVerificationStatus(
  isVerified: boolean,
  labels: Dictionary["dashboard"]["verification"],
) {
  return (
    <span
      className={isVerified
        ? "corp-badge corp-badge-success"
        : "corp-badge corp-badge-warning"}
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
    account: "/dashboard/account",
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
          <CardDescription className="corp-body-muted">{labels.session.description}</CardDescription>
        </CardHeader>
        <CardContent className="corp-body space-y-2">
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
          <CardDescription className="corp-body-muted">{labels.verification.description}</CardDescription>
        </CardHeader>
        <CardContent className="corp-body space-y-3">
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
          <CardDescription className="corp-body-muted">{labels.risk.description}</CardDescription>
        </CardHeader>
        <CardContent className="corp-body space-y-2">
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
          <CardDescription className="corp-body-muted">{labels.runtime.description}</CardDescription>
        </CardHeader>
        <CardContent className="corp-body space-y-2">
          <p>
            <span className="text-muted-foreground">{labels.runtime.rateLimitBackend}:</span>{" "}
            {labels.runtime.backends[overview.runtime.rateLimitBackend]}
          </p>
          <p>
            <span className="text-muted-foreground">{labels.runtime.transportMode}:</span>{" "}
            {overview.runtime.internalTransportMode}
          </p>
          <p>
            <span className="text-muted-foreground">{labels.runtime.resourceGroupsActive}:</span>{" "}
            {overview.resourceGroups.totalActive}
          </p>
          <p>
            <span className="text-muted-foreground">{labels.runtime.instancesActive}:</span>{" "}
            {overview.instances.totalActive}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export function NotificationsCard({ overview, labels }: Pick<DashboardSectionProps, "overview" | "labels">) {
  const hasNotificationIssues = overview.notifications.failed24h > 0;

  return (
    <Card className={corporateCardClass}>
      <CardHeader>
        <CardTitle className="corp-section-title">{labels.notifications.title}</CardTitle>
        <CardDescription className="corp-body-muted">{labels.notifications.description}</CardDescription>
      </CardHeader>
      <CardContent className="corp-body space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="corp-subcard-sm border-border/50 bg-background/60">
            <p className="text-xs text-muted-foreground">{labels.notifications.pending}</p>
            <p className="corp-value mt-1">{overview.notifications.pending}</p>
          </div>
          <div className="corp-subcard-sm border-border/50 bg-background/60">
            <p className="text-xs text-muted-foreground">{labels.notifications.sent24h}</p>
            <p className="corp-value mt-1">{overview.notifications.sent24h}</p>
          </div>
          <div className="corp-subcard-sm border-border/50 bg-background/60">
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
  createTenantAction,
}: {
  locale: Locale;
  activeSection: DashboardActiveSection;
  overview: DashboardOverview;
  labels: Dictionary["dashboard"];
  createTenantAction?: TenantCreateAction;
}) {
  return (
    <Card className={corporateCardClass}>
      <CardHeader>
        <CardTitle className="corp-section-title">{labels.tenant.title}</CardTitle>
        <CardDescription className="corp-body-muted">{labels.tenant.description}</CardDescription>
      </CardHeader>
      <CardContent className="corp-body space-y-2">
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
                    ? "corp-subcard-sm border-emerald-500/30 bg-emerald-500/5"
                    : "corp-subcard-sm border-border/50 bg-background/60"}
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
                      <Button asChild size="sm" variant="outline" className="corp-btn-sm">
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

        {createTenantAction ? (
          <TenantCreateForm
            locale={locale}
            createTenantAction={createTenantAction}
            labels={{
              title: labels.tenant.create.title,
              description: labels.tenant.create.description,
              fieldName: labels.tenant.create.fieldName,
              submitIdle: labels.tenant.create.submitIdle,
              submitLoading: labels.tenant.create.submitLoading,
              success: labels.tenant.create.success,
              errors: labels.tenant.create.errors,
            }}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ModulesCard({
  locale,
  overview,
  labels,
  activeTenantId,
}: Pick<DashboardSectionProps, "locale" | "overview" | "labels"> & { activeTenantId?: string | null }) {
  const instancesWizardHref = activeTenantId
    ? `${withLocale("/dashboard/modules/instances/new", locale)}?tenantId=${encodeURIComponent(activeTenantId)}`
    : withLocale("/dashboard/modules/instances/new", locale);

  return (
    <Card className={corporateCardClass}>
      <CardHeader>
        <CardTitle className="corp-section-title">{labels.modules.title}</CardTitle>
        <CardDescription className="corp-body-muted">{labels.modules.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="corp-subcard-sm border-border/50 bg-background/60">
          <p className="corp-title-base">{labels.modules.instances}</p>
          <p className="corp-field-hint mt-1">{labels.modules.instancesDescription}</p>
          <p className="mt-3 text-xs font-medium text-muted-foreground">
            {labels.modules.activeInstancesLabel}:{" "}
            <span className="text-foreground">{overview.instances.totalActive}</span>
          </p>
          <div className="mt-2 space-y-1">
            {overview.instances.recent.length > 0 ? (
              overview.instances.recent.slice(0, 3).map((instance) => (
                <div key={instance.instanceId} className="rounded-md border border-border/50 bg-card/80 px-2 py-1.5">
                  <p className="truncate text-xs font-medium text-foreground">{instance.name}</p>
                  <p className="corp-field-hint mt-0.5 truncate">
                    {labels.modules.lifecycle[instance.lifecycleState]} · {labels.modules.power[instance.powerState]}
                  </p>
                </div>
              ))
            ) : (
              <p className="corp-field-hint">{labels.modules.instancesEmpty}</p>
            )}
          </div>
          <Button asChild size="sm" variant="outline" className="corp-btn-sm mt-3">
            <Link href={instancesWizardHref}>
              {labels.modules.instancesWizardCta}
            </Link>
          </Button>
        </div>
        <div className="corp-subcard-sm border-border/50 bg-background/60">
          <p className="corp-title-base">{labels.modules.resourceGroups}</p>
          <p className="corp-field-hint mt-1">{labels.modules.resourceGroupsDescription}</p>
          <p className="mt-3 text-xs font-medium text-muted-foreground">
            {labels.modules.activeResourceGroupsLabel}:{" "}
            <span className="text-foreground">{overview.resourceGroups.totalActive}</span>
          </p>
          <div className="mt-2 space-y-1">
            {overview.resourceGroups.recent.length > 0 ? (
              overview.resourceGroups.recent.slice(0, 3).map((group) => (
                <div key={group.id} className="rounded-md border border-border/50 bg-card/80 px-2 py-1.5">
                  <p className="truncate text-xs font-medium text-foreground">{group.name}</p>
                  <p className="corp-field-hint mt-0.5 truncate">
                    {group.regionCode} · {formatDate(group.createdAt, locale)}
                  </p>
                </div>
              ))
            ) : (
              <p className="corp-field-hint">{labels.modules.resourceGroupsEmpty}</p>
            )}
          </div>
          <Button asChild size="sm" variant="outline" className="corp-btn-sm mt-3">
            <Link href={instancesWizardHref}>
              {labels.modules.instancesWizardCta}
            </Link>
          </Button>
        </div>
        <div className="corp-subcard-sm border-border/50 bg-background/60">
          <p className="corp-title-base">{labels.modules.network}</p>
          <p className="corp-field-hint mt-1">{labels.modules.comingSoon}</p>
        </div>
        <div className="corp-subcard-sm border-border/50 bg-background/60">
          <p className="corp-title-base">{labels.modules.backup}</p>
          <p className="corp-field-hint mt-1">{labels.modules.comingSoon}</p>
        </div>
        <div className="corp-subcard-sm border-border/50 bg-background/60">
          <p className="corp-title-base">{labels.modules.billing}</p>
          <p className="corp-field-hint mt-1">{labels.modules.comingSoon}</p>
        </div>
      </CardContent>
    </Card>
  );
}

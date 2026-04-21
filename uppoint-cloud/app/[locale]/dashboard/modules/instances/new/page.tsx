import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TenantRole } from "@prisma/client";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPanel } from "@/modules/dashboard/components/dashboard-panel";
import { loadDashboardPageData } from "@/modules/dashboard/server/page-loader";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";
import { getLocaleFromParams } from "@/modules/i18n/server";
import { InstanceProvisioningWizard } from "@/modules/instances/components/instance-provisioning-wizard";
import { getInstanceWizardBootstrap } from "@/modules/instances/server/wizard-service";
import { resolveUserTenantContext } from "@/modules/tenant/server/user-tenant";

import {
  createResourceGroupWizardAction,
  submitInstanceProvisioningWizardAction,
} from "./actions";

export const dynamic = "force-dynamic";

interface DashboardInstancesWizardPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function resolveTenantGateMessage(
  tenantErrorCode: "TENANT_NOT_FOUND" | "TENANT_ACCESS_DENIED" | "TENANT_SELECTION_REQUIRED" | null,
  labels: {
    noMembership: string;
    selectionRequired: string;
    accessDenied: string;
  },
): string {
  if (tenantErrorCode === "TENANT_NOT_FOUND") {
    return labels.noMembership;
  }

  if (tenantErrorCode === "TENANT_SELECTION_REQUIRED") {
    return labels.selectionRequired;
  }

  return labels.accessDenied;
}

export async function generateMetadata({
  params,
}: DashboardInstancesWizardPageProps): Promise<Metadata> {
  const locale = await getLocaleFromParams(params);
  const { metadata } = getDictionary(locale);

  return {
    title: metadata.dashboardInstancesWizard.title,
    description: metadata.dashboardInstancesWizard.description,
  };
}

export default async function DashboardInstancesWizardPage({
  params,
  searchParams,
}: DashboardInstancesWizardPageProps) {
  const locale = await getLocaleFromParams(params);
  const resolvedSearchParams = await searchParams;
  const { dictionary, overview } = await loadDashboardPageData({
    locale,
    callbackPath: "/dashboard/modules/instances/new",
    rawSearchParams: resolvedSearchParams,
  });

  let modulesContent: ReactNode;

  if (!overview.tenant) {
    modulesContent = (
      <Card className="border-border/70 bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle className="corp-section-title">{dictionary.dashboard.instancesWizard.title}</CardTitle>
          <CardDescription>{resolveTenantGateMessage(overview.tenantErrorCode, dictionary.dashboard.tenant)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {overview.tenantOptions.length > 0 ? (
            <div className="space-y-2">
              {overview.tenantOptions.map((option) => (
                <div key={`${option.tenantId}-${option.role}`} className="rounded-lg border border-border/60 bg-background/60 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{option.tenantName}</p>
                      <p className="text-xs text-muted-foreground">
                        {dictionary.dashboard.tenant.roleLabel}: {option.role}
                      </p>
                    </div>
                    <Button asChild size="sm" variant={option.isSelected ? "secondary" : "outline"}>
                      <Link href={`${withLocale("/dashboard/modules/instances/new", locale)}?tenantId=${encodeURIComponent(option.tenantId)}`}>
                        {option.isSelected ? dictionary.dashboard.tenant.activeLabel : dictionary.dashboard.tenant.selectorLabel}
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  } else {
    // Explicit tenant guard at app entrypoint for instances route.
    await resolveUserTenantContext({
      userId: overview.user.id,
      tenantId: overview.tenant.tenantId,
      minimumRole: TenantRole.MEMBER,
    });

    const bootstrap = await getInstanceWizardBootstrap({
      userId: overview.user.id,
      tenantId: overview.tenant.tenantId,
    });

    modulesContent = (
      <InstanceProvisioningWizard
        locale={locale}
        labels={dictionary.dashboard.instancesWizard}
        model={{
          selectedTenantId: bootstrap.selectedTenantId,
          selectedTenantRole: bootstrap.selectedTenantRole,
          tenantOptions: bootstrap.tenantOptions.map((tenantOption) => ({
            tenantId: tenantOption.tenantId,
            tenantName: tenantOption.tenantName,
            role: tenantOption.role,
            isSelected: tenantOption.isSelected,
          })),
          resourceGroups: bootstrap.resourceGroups.map((resourceGroup) => ({
            id: resourceGroup.id,
            name: resourceGroup.name,
            slug: resourceGroup.slug,
            regionCode: resourceGroup.regionCode,
          })),
          networks: bootstrap.networks.map((network) => ({
            id: network.id,
            resourceGroupId: network.resourceGroupId,
            name: network.name,
            cidr: network.cidr,
          })),
          firewallPolicies: bootstrap.firewallPolicies.map((policy) => ({
            id: policy.id,
            resourceGroupId: policy.resourceGroupId,
            name: policy.name,
            description: policy.description,
          })),
          regionCatalog: bootstrap.regionCatalog,
          planCatalog: bootstrap.planCatalog,
          imageCatalog: bootstrap.imageCatalog,
        }}
        createResourceGroupAction={createResourceGroupWizardAction}
        submitProvisioningAction={submitInstanceProvisioningWizardAction}
      />
    );
  }

  return (
    <DashboardPanel
      locale={locale}
      dictionary={dictionary}
      overview={overview}
      activeSection="modules"
      modulesContent={modulesContent}
    />
  );
}

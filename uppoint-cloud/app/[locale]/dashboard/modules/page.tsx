import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TenantRole } from "@prisma/client";

import { DashboardPanel } from "@/modules/dashboard/components/dashboard-panel";
import { loadDashboardPageData } from "@/modules/dashboard/server/page-loader";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";
import { getLocaleFromParams } from "@/modules/i18n/server";
import { ResourceGroupHierarchy } from "@/modules/instances/components/resource-group-hierarchy";
import { getInstanceResourceGroupHierarchy } from "@/modules/instances/server/resource-group-hierarchy";
import { resolveUserTenantContext } from "@/modules/tenant/server/user-tenant";

export const dynamic = "force-dynamic";

interface DashboardModulesPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: DashboardModulesPageProps): Promise<Metadata> {
  const locale = await getLocaleFromParams(params);
  const { metadata } = getDictionary(locale);

  return {
    title: metadata.dashboardModules.title,
    description: metadata.dashboardModules.description,
  };
}

export default async function DashboardModulesPage({
  params,
  searchParams,
}: DashboardModulesPageProps) {
  const locale = await getLocaleFromParams(params);
  const { dictionary, overview } = await loadDashboardPageData({
    locale,
    callbackPath: "/dashboard/modules",
    rawSearchParams: await searchParams,
  });

  let modulesContent: ReactNode;

  if (overview.tenant) {
    await resolveUserTenantContext({
      userId: overview.user.id,
      tenantId: overview.tenant.tenantId,
      minimumRole: TenantRole.MEMBER,
    });

    const hierarchy = await getInstanceResourceGroupHierarchy({
      userId: overview.user.id,
      tenantId: overview.tenant.tenantId,
    });
    const selectedTenant = overview.tenantOptions.find((option) => option.isSelected);
    const setupHref = `${withLocale("/dashboard/modules/instances/new", locale)}?tenantId=${encodeURIComponent(overview.tenant.tenantId)}`;

    modulesContent = (
      <ResourceGroupHierarchy
        locale={locale}
        labels={dictionary.dashboard.modules}
        hierarchy={hierarchy}
        tenantName={selectedTenant?.tenantName ?? overview.tenant.tenantId}
        tenantRole={overview.tenant.role}
        setupHref={setupHref}
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

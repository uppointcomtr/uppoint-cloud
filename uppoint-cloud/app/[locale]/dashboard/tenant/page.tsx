import type { Metadata } from "next";
import { z } from "zod";

import { DashboardPanel } from "@/modules/dashboard/components/dashboard-panel";
import { listUserTenantMembershipsForManagement } from "@/db/repositories/tenant-repository";
import { loadDashboardPageData } from "@/modules/dashboard/server/page-loader";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocaleFromParams } from "@/modules/i18n/server";
import { TenantCenter } from "@/modules/tenant/components/tenant-center";
import { getTenantManagementDetailForUser, TenantManagementError } from "@/modules/tenant/server/tenant-management";

import { createTenantDashboardAction, deleteTenantDashboardAction } from "./actions";

export const dynamic = "force-dynamic";

const tenantViewSearchParamSchema = z.object({
  tenantView: z.string().trim().min(1).max(191).optional(),
});

interface DashboardTenantPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: DashboardTenantPageProps): Promise<Metadata> {
  const locale = await getLocaleFromParams(params);
  const { metadata } = getDictionary(locale);

  return {
    title: metadata.dashboardTenant.title,
    description: metadata.dashboardTenant.description,
  };
}

export default async function DashboardTenantPage({
  params,
  searchParams,
}: DashboardTenantPageProps) {
  const locale = await getLocaleFromParams(params);
  const rawSearchParams = await searchParams;
  // Dashboard tenant context remains server-enforced in loadDashboardPageData() -> getDashboardOverview() -> resolveUserTenantContext().
  const { dictionary, overview } = await loadDashboardPageData({
    locale,
    callbackPath: "/dashboard/tenant",
    rawSearchParams,
  });
  const tenantViewValue = rawSearchParams.tenantView;
  const parsedTenantView = tenantViewSearchParamSchema.safeParse({
    tenantView: Array.isArray(tenantViewValue) ? tenantViewValue[0] : tenantViewValue,
  });
  const tenantView = parsedTenantView.success ? parsedTenantView.data.tenantView : undefined;
  const managementTenantList = await listUserTenantMembershipsForManagement({
    userId: overview.user.id,
    take: 50,
  });
  const tenantRows = managementTenantList.map((tenant) => ({
    tenantId: tenant.tenantId,
    tenantName: tenant.tenantName,
    role: tenant.role,
    isDisabled: Boolean(tenant.tenantDeletedAt),
  }));

  let selectedTenantDetail = null;

  if (tenantView) {
    const selectedTenant = tenantRows.find((tenant) => tenant.tenantId === tenantView) ?? null;

    if (!selectedTenant?.isDisabled) {
      try {
        // Tenant detail access remains fail-closed in getTenantManagementDetailForUser() -> assertTenantAccess().
        const detail = await getTenantManagementDetailForUser({
          userId: overview.user.id,
          tenantId: tenantView,
        });

        selectedTenantDetail = {
          tenantId: detail.tenantId,
          tenantName: selectedTenant?.tenantName ?? detail.tenantId,
          role: detail.role,
          permissions: detail.permissions,
          resourceGroups: detail.resourceGroups.map((resourceGroup) => ({
            id: resourceGroup.id,
            name: resourceGroup.name,
            slug: resourceGroup.slug,
            regionCode: resourceGroup.regionCode,
            createdAtIso: resourceGroup.createdAt.toISOString(),
          })),
          canDelete: detail.canDelete,
          deleteBlockedReason: detail.deleteBlockedReason,
        };
      } catch (error) {
        if (!(error instanceof TenantManagementError)) {
          throw error;
        }
      }
    }
  }

  return (
    <DashboardPanel
      locale={locale}
      dictionary={dictionary}
      overview={overview}
      activeSection="tenant"
      createTenantAction={createTenantDashboardAction}
      tenantContent={(
        <TenantCenter
          locale={locale}
          labels={dictionary.dashboard.tenant}
          tenantErrorCode={overview.tenantErrorCode}
          tenants={tenantRows}
          selectedTenantDetail={selectedTenantDetail}
          createTenantAction={createTenantDashboardAction}
          deleteTenantAction={deleteTenantDashboardAction}
        />
      )}
    />
  );
}

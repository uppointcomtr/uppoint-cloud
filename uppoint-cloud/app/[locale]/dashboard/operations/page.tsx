import type { Metadata } from "next";

import { DashboardPanel } from "@/modules/dashboard/components/dashboard-panel";
import { loadDashboardPageData } from "@/modules/dashboard/server/page-loader";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocaleFromParams } from "@/modules/i18n/server";
import { OperationsCenter } from "@/modules/platform/components/operations-center";
import { loadPlatformOperationsSummary } from "@/modules/platform/server/operations-loader";
import { requirePlatformAccess } from "@/modules/platform/server/platform-access";

export const dynamic = "force-dynamic";

interface DashboardOperationsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: DashboardOperationsPageProps): Promise<Metadata> {
  const locale = await getLocaleFromParams(params);
  const { metadata } = getDictionary(locale);

  return {
    title: metadata.dashboardOperations.title,
    description: metadata.dashboardOperations.description,
  };
}

export default async function DashboardOperationsPage({
  params,
  searchParams,
}: DashboardOperationsPageProps) {
  const locale = await getLocaleFromParams(params);
  const { dictionary, overview } = await loadDashboardPageData({
    locale,
    callbackPath: "/dashboard/operations",
    rawSearchParams: await searchParams,
  });

  await requirePlatformAccess({
    userId: overview.user.id,
    permission: "platform:operations:read",
  });

  const operationsSummary = await loadPlatformOperationsSummary({ take: 20 });

  return (
    <DashboardPanel
      locale={locale}
      dictionary={dictionary}
      overview={overview}
      activeSection="operations"
      operationsContent={(
        <OperationsCenter
          locale={locale}
          labels={dictionary.dashboard.operations}
          summary={operationsSummary}
        />
      )}
    />
  );
}

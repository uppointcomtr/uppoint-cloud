import type { Metadata } from "next";

import { DashboardPanel } from "@/modules/dashboard/components/dashboard-panel";
import { loadDashboardPageData } from "@/modules/dashboard/server/page-loader";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocaleFromParams } from "@/modules/i18n/server";

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

  return (
    <DashboardPanel
      locale={locale}
      dictionary={dictionary}
      overview={overview}
      activeSection="modules"
    />
  );
}

import type { Metadata } from "next";

import { DashboardPanel } from "@/modules/dashboard/components/dashboard-panel";
import { loadDashboardPageData } from "@/modules/dashboard/server/page-loader";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocaleFromParams } from "@/modules/i18n/server";

export const dynamic = "force-dynamic";

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
    title: metadata.dashboard.title,
    description: metadata.dashboard.description,
  };
}

export default async function DashboardTenantPage({
  params,
  searchParams,
}: DashboardTenantPageProps) {
  const locale = await getLocaleFromParams(params);
  const { dictionary, overview } = await loadDashboardPageData({
    locale,
    callbackPath: "/dashboard/tenant",
    rawSearchParams: await searchParams,
  });

  return (
    <DashboardPanel
      locale={locale}
      dictionary={dictionary}
      overview={overview}
      activeSection="tenant"
    />
  );
}

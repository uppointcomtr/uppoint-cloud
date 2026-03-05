import type { Metadata } from "next";

import { DashboardPanel } from "@/modules/dashboard/components/dashboard-panel";
import { loadDashboardPageData } from "@/modules/dashboard/server/page-loader";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocaleFromParams } from "@/modules/i18n/server";

export const dynamic = "force-dynamic";

interface DashboardNotificationsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: DashboardNotificationsPageProps): Promise<Metadata> {
  const locale = await getLocaleFromParams(params);
  const { metadata } = getDictionary(locale);

  return {
    title: metadata.dashboardNotifications.title,
    description: metadata.dashboardNotifications.description,
  };
}

export default async function DashboardNotificationsPage({
  params,
  searchParams,
}: DashboardNotificationsPageProps) {
  const locale = await getLocaleFromParams(params);
  const { dictionary, overview } = await loadDashboardPageData({
    locale,
    callbackPath: "/dashboard/notifications",
    rawSearchParams: await searchParams,
  });

  return (
    <DashboardPanel
      locale={locale}
      dictionary={dictionary}
      overview={overview}
      activeSection="notifications"
    />
  );
}

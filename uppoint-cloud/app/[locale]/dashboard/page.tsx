import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit-log";
import { DashboardPanel } from "@/modules/dashboard/components/dashboard-panel";
import { getDashboardOverview } from "@/modules/dashboard/server/get-dashboard-overview";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";
import { getLocaleFromParams } from "@/modules/i18n/server";

export const dynamic = "force-dynamic";

interface DashboardPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tenantId?: string }>;
}

const dashboardSearchParamsSchema = z.object({
  tenantId: z.string().trim().min(1).max(128).optional(),
});

export async function generateMetadata({ params }: DashboardPageProps): Promise<Metadata> {
  const locale = await getLocaleFromParams(params);
  const { metadata } = getDictionary(locale);
  return { title: metadata.dashboard.title, description: metadata.dashboard.description };
}

export default async function DashboardPage({ params, searchParams }: DashboardPageProps) {
  const locale = await getLocaleFromParams(params);
  const dictionary = getDictionary(locale);
  const session = await auth();

  if (!session?.user) {
    redirect(`${withLocale("/login", locale)}?callbackUrl=${encodeURIComponent(withLocale("/dashboard", locale))}`);
  }

  const parsedSearchParams = dashboardSearchParamsSchema.safeParse(await searchParams);
  if (!parsedSearchParams.success) {
    await logAudit("tenant_access_denied", "unknown", session.user.id, {
      reason: "TENANT_SELECTION_INVALID",
      result: "FAILURE",
    });
  }

  const overview = await getDashboardOverview({
    userId: session.user.id,
    sessionExpiresAt: session.expires,
    tenantId: parsedSearchParams.success ? parsedSearchParams.data.tenantId : undefined,
  });

  return (
    <DashboardPanel locale={locale} dictionary={dictionary} overview={overview} />
  );
}

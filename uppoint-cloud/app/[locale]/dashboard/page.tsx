import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LogoutButton } from "@/modules/auth/components/logout-button";
import { SessionTimeoutWarning } from "@/modules/auth/components/session-timeout-warning";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";
import { getLocaleFromParams } from "@/modules/i18n/server";
import { resolveUserTenantContext } from "@/modules/tenant/server/user-tenant";

export const dynamic = "force-dynamic";

interface DashboardPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tenantId?: string }>;
}

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

  const { tenantId } = await searchParams;
  const tenantContext = await resolveUserTenantContext({
    userId: session.user.id,
    tenantId,
  });

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-5xl flex-col gap-6 px-6 py-16">
      <SessionTimeoutWarning
        locale={locale}
        dictionary={dictionary.sessionTimeout}
        sessionExpires={session.expires}
      />
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{dictionary.dashboard.title}</h1>
          <p className="text-sm text-muted-foreground">{dictionary.dashboard.description}</p>
        </div>
        <LogoutButton locale={locale} label={dictionary.logout.button} />
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{dictionary.dashboard.cardTitle}</CardTitle>
          <CardDescription>
            {dictionary.dashboard.cardDescriptionPrefix} {session.user.email}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p>{dictionary.dashboard.cardContent}</p>
          <p className="text-sm text-muted-foreground">
            {dictionary.dashboard.tenantLabel}: {tenantContext.tenantId}
          </p>
          <p className="text-sm text-muted-foreground">
            {dictionary.dashboard.roleLabel}: {tenantContext.role}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

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
import { logAudit } from "@/lib/audit-log";
import { LogoutButton } from "@/modules/auth/components/logout-button";
import { SessionTimeoutWarning } from "@/modules/auth/components/session-timeout-warning";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";
import { getLocaleFromParams } from "@/modules/i18n/server";
import { resolveUserTenantContext, UserTenantContextError } from "@/modules/tenant/server/user-tenant";

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
  let tenantContext: Awaited<ReturnType<typeof resolveUserTenantContext>> | null = null;
  let tenantContextError: UserTenantContextError["code"] | null = null;

  try {
    tenantContext = await resolveUserTenantContext({
      userId: session.user.id,
      tenantId,
    });
  } catch (error) {
    if (error instanceof UserTenantContextError) {
      tenantContextError = error.code;
      await logAudit(
        error.code === "TENANT_NOT_FOUND" ? "tenant_context_missing" : "tenant_access_denied",
        "unknown",
        session.user.id,
        {
          reason: error.code,
          tenantId: tenantId ?? null,
          result: "FAILURE",
        },
      );
    } else {
      throw error;
    }
  }

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
          <CardTitle>
            {tenantContext ? dictionary.dashboard.cardTitle : dictionary.dashboard.tenantContextError.title}
          </CardTitle>
          <CardDescription>
            {tenantContext
              ? `${dictionary.dashboard.cardDescriptionPrefix} ${session.user.email}.`
              : dictionary.dashboard.tenantContextError.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {tenantContext ? (
            <>
              <p>{dictionary.dashboard.cardContent}</p>
              <p className="text-sm text-muted-foreground">
                {dictionary.dashboard.tenantLabel}: {tenantContext.tenantId}
              </p>
              <p className="text-sm text-muted-foreground">
                {dictionary.dashboard.roleLabel}: {tenantContext.role}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {tenantContextError === "TENANT_NOT_FOUND"
                ? dictionary.dashboard.tenantContextError.noMembership
                : tenantContextError === "TENANT_SELECTION_REQUIRED"
                  ? dictionary.dashboard.tenantContextError.selectionRequired
                  : dictionary.dashboard.tenantContextError.accessDenied}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

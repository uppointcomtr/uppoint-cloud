import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit-log";
import { env } from "@/lib/env";
import { resolveTrustedClientIp } from "@/lib/security/client-ip";
import { parseSessionExpiry } from "@/modules/auth/server/session-expiry";
import type { DashboardOverview } from "@/modules/dashboard/server/get-dashboard-overview";
import { getDashboardOverview } from "@/modules/dashboard/server/get-dashboard-overview";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";

const dashboardSearchParamsSchema = z.object({
  tenantId: z.string().trim().min(1).max(128).optional(),
});

const SESSION_EXPIRY_FALLBACK_ISO = "2099-01-01T00:00:00.000Z";

export interface DashboardPageData {
  dictionary: Dictionary;
  overview: DashboardOverview;
}

export async function loadDashboardPageData(input: {
  locale: Locale;
  callbackPath:
    | "/dashboard"
    | "/dashboard/account"
    | "/dashboard/security"
    | "/dashboard/notifications"
    | "/dashboard/tenant"
    | "/dashboard/modules";
  rawSearchParams: Record<string, string | string[] | undefined>;
}): Promise<DashboardPageData> {
  const dictionary = getDictionary(input.locale);
  const session = await auth();

  if (!session?.user) {
    redirect(`${withLocale("/login", input.locale)}?callbackUrl=${encodeURIComponent(withLocale(input.callbackPath, input.locale))}`);
  }

  const parsedSessionExpiresAt = parseSessionExpiry(session.expires);
  // Invalid expiry is handled with a safe fallback, but this is not a real revocation event.
  // Do not emit `session_revoked` here to avoid misleading duplicate security records.
  const sessionExpiresAt = parsedSessionExpiresAt ?? new Date(SESSION_EXPIRY_FALLBACK_ISO);

  const requestHeaders = await headers();
  const realIp = requestHeaders.get("x-real-ip")?.trim() ?? null;
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const resolvedClientIp = resolveTrustedClientIp({
    realIpHeader: realIp,
    forwardedForHeader: forwardedFor,
    isProduction: env.NODE_ENV === "production",
  });
  const requestUserAgent = requestHeaders.get("user-agent");
  const requestId = requestHeaders.get("x-request-id")?.trim() ?? null;

  const tenantIdValue = input.rawSearchParams.tenantId;
  const parsedSearchParams = dashboardSearchParamsSchema.safeParse({
    tenantId: Array.isArray(tenantIdValue) ? tenantIdValue[0] : tenantIdValue,
  });
  if (!parsedSearchParams.success) {
    await logAudit("tenant_selection_invalid", resolvedClientIp ?? "unknown", session.user.id, {
      reason: "TENANT_SELECTION_INVALID",
      result: "FAILURE",
      requestId,
      userAgent: requestUserAgent,
      forwardedFor,
    });
  }

  const overview = await getDashboardOverview({
    userId: session.user.id,
    sessionExpiresAt: sessionExpiresAt.toISOString(),
    tenantId: parsedSearchParams.success ? parsedSearchParams.data.tenantId : undefined,
    currentRequestIp: resolvedClientIp,
    currentRequestUserAgent: requestUserAgent,
    currentRequestId: requestId,
    currentForwardedFor: forwardedFor,
  });

  return {
    dictionary,
    overview,
  };
}

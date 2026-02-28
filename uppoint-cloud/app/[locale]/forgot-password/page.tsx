import { redirect } from "next/navigation";

import { withLocale } from "@/modules/i18n/paths";
import { getLocaleFromParams } from "@/modules/i18n/server";

export const dynamic = "force-dynamic";

interface ForgotPasswordPageProps {
  params: Promise<{ locale: string }>;
}

export default async function ForgotPasswordPage({ params }: ForgotPasswordPageProps) {
  const locale = await getLocaleFromParams(params);
  redirect(withLocale("/login", locale));
}

import { redirect } from "next/navigation";

import { withLocale } from "@/modules/i18n/paths";
import { getLocaleFromParams } from "@/modules/i18n/server";

export const dynamic = "force-dynamic";

interface ResetPasswordPageProps {
  params: Promise<{ locale: string }>;
}

export default async function ResetPasswordPage({ params }: ResetPasswordPageProps) {
  const locale = await getLocaleFromParams(params);
  redirect(withLocale("/login", locale));
}

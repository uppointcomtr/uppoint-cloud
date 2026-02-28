import { redirect } from "next/navigation";

import { getLocaleFromParams } from "@/modules/i18n/server";
import { withLocale } from "@/modules/i18n/paths";

export const dynamic = "force-dynamic";

interface LocalizedHomePageProps {
  params: Promise<{ locale: string }>;
}

export default async function LocalizedHomePage({ params }: LocalizedHomePageProps) {
  const locale = await getLocaleFromParams(params);
  redirect(withLocale("/login", locale));
}

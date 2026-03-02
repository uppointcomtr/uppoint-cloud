import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getDictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";
import { getLocaleFromParams } from "@/modules/i18n/server";

export const dynamic = "force-dynamic";

interface VerifyEmailPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: VerifyEmailPageProps): Promise<Metadata> {
  const locale = await getLocaleFromParams(params);
  const { metadata } = getDictionary(locale);
  return { title: metadata.login.title, description: metadata.login.description };
}

export default async function VerifyEmailPage({
  params,
}: VerifyEmailPageProps) {
  const locale = await getLocaleFromParams(params);
  redirect(withLocale("/login", locale));
}

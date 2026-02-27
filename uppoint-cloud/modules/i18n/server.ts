import { notFound } from "next/navigation";

import { isLocale, type Locale } from "@/modules/i18n/config";

interface LocaleParams {
  locale: string;
}

export async function getLocaleFromParams(
  params: Promise<LocaleParams> | LocaleParams,
): Promise<Locale> {
  const resolvedParams = await params;

  if (!isLocale(resolvedParams.locale)) {
    notFound();
  }

  return resolvedParams.locale;
}

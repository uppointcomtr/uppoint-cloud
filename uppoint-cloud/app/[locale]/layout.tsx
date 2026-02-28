import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getDictionary } from "@/modules/i18n/dictionaries";
import { locales } from "@/modules/i18n/config";
import { getLocaleFromParams } from "@/modules/i18n/server";

interface LocaleLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Omit<LocaleLayoutProps, "children">): Promise<Metadata> {
  const locale = await getLocaleFromParams(params);
  const dictionary = getDictionary(locale);

  return {
    title: dictionary.metadata.title,
    description: dictionary.metadata.description,
  };
}

export default function LocaleLayout({ children }: Pick<LocaleLayoutProps, "children">) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {children}
    </div>
  );
}

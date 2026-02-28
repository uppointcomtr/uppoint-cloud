"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { type Locale } from "@/modules/i18n/config";
import { stripLocaleFromPath, withLocale } from "@/modules/i18n/paths";

interface LocaleSwitcherLabels {
  tr: string;
  en: string;
}

interface LocaleSwitcherProps {
  locale: Locale;
  labels: LocaleSwitcherLabels;
}

export function LocaleSwitcher({ locale, labels }: LocaleSwitcherProps) {
  const pathname = usePathname() ?? "/";
  const targetLocale: Locale = locale === "tr" ? "en" : "tr";
  const targetPath = withLocale(stripLocaleFromPath(pathname), targetLocale);
  const targetLabel = targetLocale === "tr" ? labels.tr : labels.en;

  return (
    <Button asChild variant="ghost" size="sm" className="min-w-16">
      <Link href={targetPath} hrefLang={targetLocale} lang={targetLocale}>
        {targetLabel}
      </Link>
    </Button>
  );
}

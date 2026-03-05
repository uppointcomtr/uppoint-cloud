"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type Locale } from "@/modules/i18n/config";
import { stripLocaleFromPath, withLocale } from "@/modules/i18n/paths";

interface LocaleSwitcherLabels {
  tr: string;
  en: string;
}

interface LocaleSwitcherProps {
  locale: Locale;
  labels: LocaleSwitcherLabels;
  className?: string;
}

export function LocaleSwitcher({ locale, labels, className }: LocaleSwitcherProps) {
  const pathname = usePathname() ?? "/";
  const targetLocale: Locale = locale === "tr" ? "en" : "tr";
  const targetPath = withLocale(stripLocaleFromPath(pathname), targetLocale);
  const targetLabel = targetLocale === "tr" ? labels.tr : labels.en;

  return (
    <Button
      asChild
      variant="outline"
      size="icon-sm"
      className={cn(
        "size-8 border-border/70 bg-background/80 text-[13px] font-semibold text-foreground hover:bg-accent/80 dark:bg-background/60",
        className,
      )}
    >
      <Link href={targetPath} hrefLang={targetLocale} lang={targetLocale}>
        {targetLabel}
      </Link>
    </Button>
  );
}

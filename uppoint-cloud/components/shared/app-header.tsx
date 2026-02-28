import Link from "next/link";
import Image from "next/image";

import { type Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";

import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";

interface AppHeaderProps {
  locale: Locale;
  dictionary: Dictionary["header"];
}

export function AppHeader({ locale, dictionary }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link
          href={withLocale("/login", locale)}
          aria-label={dictionary.brand}
          className="inline-flex shrink-0 items-center"
        >
          <Image
            src="/logo/uppoint-logo-black.webp"
            alt={dictionary.brand}
            width={416}
            height={127}
            unoptimized
            className="block w-[180px] h-auto dark:hidden"
          />
          <Image
            src="/logo/Uppoint-logo-wh.webp"
            alt={dictionary.brand}
            width={416}
            height={127}
            unoptimized
            className="hidden w-[180px] h-auto dark:block"
          />
          <span className="sr-only">{dictionary.brand}</span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <LocaleSwitcher locale={locale} labels={dictionary.locales} />
          <ThemeToggle labels={dictionary.theme} />
        </div>
      </div>
    </header>
  );
}

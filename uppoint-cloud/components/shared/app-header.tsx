import Link from "next/link";

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
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href={withLocale("/", locale)} className="text-sm font-semibold tracking-tight">
          {dictionary.brand}
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            href={withLocale("/", locale)}
            className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:inline-block"
          >
            {dictionary.home}
          </Link>
          <LocaleSwitcher locale={locale} labels={dictionary.locales} />
          <ThemeToggle labels={dictionary.theme} />
        </div>
      </div>
    </header>
  );
}

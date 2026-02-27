import Link from "next/link";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocaleFromParams } from "@/modules/i18n/server";
import { withLocale } from "@/modules/i18n/paths";

export const dynamic = "force-dynamic";

interface LocalizedHomePageProps {
  params: Promise<{ locale: string }>;
}

export default async function LocalizedHomePage({ params }: LocalizedHomePageProps) {
  const locale = await getLocaleFromParams(params);
  const dictionary = getDictionary(locale);
  const session = await auth();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">{dictionary.home.domain}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{dictionary.home.title}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{dictionary.home.description}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        {session?.user ? (
          <Button asChild>
            <Link href={withLocale("/dashboard", locale)}>{dictionary.home.cta.dashboard}</Link>
          </Button>
        ) : (
          <>
            <Button asChild>
              <Link href={withLocale("/login", locale)}>{dictionary.home.cta.signIn}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={withLocale("/register", locale)}>{dictionary.home.cta.register}</Link>
            </Button>
          </>
        )}
      </div>
    </main>
  );
}

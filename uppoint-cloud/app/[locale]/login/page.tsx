import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LoginForm } from "@/modules/auth/components/login-form";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocaleFromParams } from "@/modules/i18n/server";
import { withLocale } from "@/modules/i18n/paths";

export const dynamic = "force-dynamic";

interface LoginPageProps {
  params: Promise<{ locale: string }>;
}

export default async function LoginPage({ params }: LoginPageProps) {
  const locale = await getLocaleFromParams(params);
  const session = await auth();

  if (session?.user) {
    redirect(withLocale("/dashboard", locale));
  }

  const dictionary = getDictionary(locale);

  return (
    <main className="relative isolate flex min-h-[calc(100vh-4rem)] w-full items-center justify-center overflow-hidden px-6 py-16">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-indigo-400/20 blur-[120px] dark:bg-indigo-500/10" />
        <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-violet-400/20 blur-[120px] dark:bg-violet-500/10" />
        <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-300/15 blur-[80px] dark:bg-sky-500/8" />
      </div>
      <LoginForm locale={locale} dictionary={dictionary.login} />
    </main>
  );
}

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
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-4xl items-center justify-center px-6 py-16">
      <LoginForm locale={locale} dictionary={dictionary.login} />
    </main>
  );
}

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { RegisterForm } from "@/modules/auth/components/register-form";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocaleFromParams } from "@/modules/i18n/server";
import { withLocale } from "@/modules/i18n/paths";

export const dynamic = "force-dynamic";

interface RegisterPageProps {
  params: Promise<{ locale: string }>;
}

export default async function RegisterPage({ params }: RegisterPageProps) {
  const locale = await getLocaleFromParams(params);
  const session = await auth();

  if (session?.user) {
    redirect(withLocale("/dashboard", locale));
  }

  const dictionary = getDictionary(locale);

  return (
    <main className="flex min-h-[calc(100vh-4rem)] w-full items-center justify-center px-6 py-16">
      <RegisterForm
        locale={locale}
        dictionary={dictionary.register}
        validation={dictionary.validation}
        apiErrors={dictionary.apiErrors}
      />
    </main>
  );
}

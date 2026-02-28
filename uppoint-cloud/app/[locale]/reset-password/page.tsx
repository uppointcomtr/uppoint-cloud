import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ResetPasswordForm } from "@/modules/auth/components/reset-password-form";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";
import { getLocaleFromParams } from "@/modules/i18n/server";

export const dynamic = "force-dynamic";

interface ResetPasswordPageProps {
  params: Promise<{ locale: string }>;
}

export default async function ResetPasswordPage({ params }: ResetPasswordPageProps) {
  const locale = await getLocaleFromParams(params);
  const session = await auth();

  if (session?.user) {
    redirect(withLocale("/dashboard", locale));
  }

  const dictionary = getDictionary(locale);

  return (
    <main className="flex min-h-[calc(100vh-4rem)] w-full items-center justify-center px-6 py-16">
      <ResetPasswordForm locale={locale} dictionary={dictionary.resetPassword} />
    </main>
  );
}

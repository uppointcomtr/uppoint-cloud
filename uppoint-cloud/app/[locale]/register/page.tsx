import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AuthSplitShell } from "@/modules/auth/components/auth-split-shell";
import { RegisterForm } from "@/modules/auth/components/register-form";
import { parseSessionExpiry } from "@/modules/auth/server/session-expiry";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";
import { getLocaleFromParams } from "@/modules/i18n/server";

export const dynamic = "force-dynamic";

interface RegisterPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: RegisterPageProps): Promise<Metadata> {
  const locale = await getLocaleFromParams(params);
  const { metadata } = getDictionary(locale);
  return { title: metadata.register.title, description: metadata.register.description };
}

export default async function RegisterPage({ params }: RegisterPageProps) {
  const locale = await getLocaleFromParams(params);
  const session = await auth();

  if (session?.user && parseSessionExpiry(session.expires)) {
    redirect(withLocale("/dashboard", locale));
  }

  const dictionary = getDictionary(locale);

  return (
    <AuthSplitShell locale={locale} header={dictionary.header} shell={dictionary.authShell}>
      <RegisterForm
        locale={locale}
        dictionary={dictionary.register}
        validation={dictionary.validation}
        apiErrors={dictionary.apiErrors}
      />
    </AuthSplitShell>
  );
}

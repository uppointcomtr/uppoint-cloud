import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AuthSplitShell } from "@/modules/auth/components/auth-split-shell";
import { LoginForm } from "@/modules/auth/components/login-form";
import { parseSessionExpiry } from "@/modules/auth/server/session-expiry";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";
import { getLocaleFromParams } from "@/modules/i18n/server";

export const dynamic = "force-dynamic";

interface LoginPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: LoginPageProps): Promise<Metadata> {
  const locale = await getLocaleFromParams(params);
  const { metadata } = getDictionary(locale);
  return { title: metadata.login.title, description: metadata.login.description };
}

export default async function LoginPage({ params }: LoginPageProps) {
  const locale = await getLocaleFromParams(params);
  const session = await auth();

  if (session?.user && parseSessionExpiry(session.expires)) {
    redirect(withLocale("/dashboard", locale));
  }

  const dictionary = getDictionary(locale);

  return (
    <AuthSplitShell locale={locale} header={dictionary.header} shell={dictionary.authShell}>
      <LoginForm
        locale={locale}
        dictionary={dictionary.login}
        passwordRecoveryDictionary={dictionary.passwordRecovery}
        validation={dictionary.validation}
      />
    </AuthSplitShell>
  );
}

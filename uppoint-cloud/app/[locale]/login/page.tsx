import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AuthSplitShell } from "@/modules/auth/components/auth-split-shell";
import { LoginForm } from "@/modules/auth/components/login-form";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";
import { getLocaleFromParams } from "@/modules/i18n/server";

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
    <AuthSplitShell locale={locale} header={dictionary.header} panel={dictionary.authShell}>
      <LoginForm
        locale={locale}
        dictionary={dictionary.login}
        passwordRecoveryDictionary={dictionary.passwordRecovery}
        validation={dictionary.validation}
      />
    </AuthSplitShell>
  );
}

import type { Metadata } from "next";
import { AuthSplitShell } from "@/modules/auth/components/auth-split-shell";
import { VerifyEmailStatus } from "@/modules/auth/components/verify-email-status";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocaleFromParams } from "@/modules/i18n/server";

export const dynamic = "force-dynamic";

interface VerifyEmailPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}

export async function generateMetadata({ params }: VerifyEmailPageProps): Promise<Metadata> {
  const locale = await getLocaleFromParams(params);
  const { metadata } = getDictionary(locale);
  return { title: metadata.verifyEmail.title, description: metadata.verifyEmail.description };
}

export default async function VerifyEmailPage({
  params,
  searchParams,
}: VerifyEmailPageProps) {
  const locale = await getLocaleFromParams(params);
  const { token } = await searchParams;
  const dictionary = getDictionary(locale);

  return (
    <AuthSplitShell locale={locale} header={dictionary.header}>
      <VerifyEmailStatus
        locale={locale}
        tokenFromQuery={token ?? null}
        dictionary={dictionary.emailVerification}
      />
    </AuthSplitShell>
  );
}

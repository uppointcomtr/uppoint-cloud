import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  verifyEmailToken,
  EmailVerificationError,
} from "@/modules/auth/server/email-verification";
import { AuthSplitShell } from "@/modules/auth/components/auth-split-shell";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocaleFromParams } from "@/modules/i18n/server";
import { withLocale } from "@/modules/i18n/paths";

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
  const d = dictionary.emailVerification;

  let success = false;
  let errorKey: keyof typeof d.errors = "generic";

  if (!token) {
    errorKey = "missingToken";
  } else {
    try {
      await verifyEmailToken(token);
      success = true;
    } catch (error) {
      if (
        error instanceof EmailVerificationError &&
        error.code === "INVALID_OR_EXPIRED_TOKEN"
      ) {
        errorKey = "invalidOrExpired";
      }
    }
  }

  return (
    <AuthSplitShell locale={locale} header={dictionary.header}>
      <div className="flex flex-col items-center py-4 text-center">
        {success ? (
          <>
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-8 ring-primary/5">
              <CheckCircle className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground">{d.successTitle}</h1>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              {d.successDescription}
            </p>
            <Button asChild className="mt-6 w-full">
              <Link href={withLocale("/dashboard", locale)}>{d.goToDashboard}</Link>
            </Button>
          </>
        ) : (
          <>
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 ring-8 ring-destructive/5">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <h1 className="text-xl font-bold text-foreground">{d.errorTitle}</h1>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              {d.errors[errorKey]}
            </p>
            <Button asChild variant="ghost" className="mt-6 w-full">
              <Link href={withLocale("/login", locale)}>{d.backToLogin}</Link>
            </Button>
          </>
        )}
      </div>
    </AuthSplitShell>
  );
}

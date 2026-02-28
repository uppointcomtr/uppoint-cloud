import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AuthCard } from "@/modules/auth/components/auth-card";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";
import { getLocaleFromParams } from "@/modules/i18n/server";

export const dynamic = "force-dynamic";

interface ForgotPasswordPageProps {
  params: Promise<{ locale: string }>;
}

export default async function ForgotPasswordPage({ params }: ForgotPasswordPageProps) {
  const locale = await getLocaleFromParams(params);
  const session = await auth();

  if (session?.user) {
    redirect(withLocale("/dashboard", locale));
  }

  const dictionary = getDictionary(locale);

  return (
    <main className="flex min-h-[calc(100vh-4rem)] w-full items-center justify-center px-6 py-16">
      <AuthCard
        title={dictionary.forgotPassword.title}
        description={dictionary.forgotPassword.description}
        headerContent={
          <div className="mb-2 inline-flex items-center" aria-hidden>
            <Image
              src="/logo/uppoint-logo-black.webp"
              alt=""
              width={416}
              height={127}
              unoptimized
              className="block h-9 w-auto dark:hidden"
            />
            <Image
              src="/logo/Uppoint-logo-wh.webp"
              alt=""
              width={416}
              height={127}
              unoptimized
              className="hidden h-9 w-auto dark:block"
            />
          </div>
        }
        footer={
          <Link
            href={withLocale("/login", locale)}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            {dictionary.forgotPassword.backToLogin}
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">{dictionary.forgotPassword.notice}</p>
      </AuthCard>
    </main>
  );
}

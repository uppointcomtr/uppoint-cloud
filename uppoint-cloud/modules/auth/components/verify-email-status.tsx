"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Locale } from "@/modules/i18n/config";
import { withLocale } from "@/modules/i18n/paths";

interface VerifyEmailStatusDictionary {
  successTitle: string;
  successDescription: string;
  errorTitle: string;
  goToDashboard: string;
  backToLogin: string;
  errors: {
    invalidOrExpired: string;
    missingToken: string;
    generic: string;
  };
}

interface VerifyEmailStatusProps {
  locale: Locale;
  token: string | null;
  dictionary: VerifyEmailStatusDictionary;
}

type VerificationState = "idle" | "success" | "error";
type ErrorKey = keyof VerifyEmailStatusDictionary["errors"];

export function VerifyEmailStatus({ locale, token, dictionary }: VerifyEmailStatusProps) {
  const [state, setState] = useState<VerificationState>(token ? "idle" : "error");
  const [errorKey, setErrorKey] = useState<ErrorKey>(token ? "generic" : "missingToken");

  useEffect(() => {
    if (!token) {
      setState("error");
      setErrorKey("missingToken");
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15_000);

    async function verify() {
      try {
        const response = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
          signal: controller.signal,
        });

        let payload: { success?: boolean; error?: string } | null = null;
        try {
          payload = (await response.json()) as { success?: boolean; error?: string };
        } catch {
          payload = null;
        }

        if (response.ok && payload?.success) {
          setState("success");
          return;
        }

        if (payload?.error === "INVALID_OR_EXPIRED_TOKEN") {
          setErrorKey("invalidOrExpired");
        } else if (payload?.error === "INVALID_BODY") {
          setErrorKey("missingToken");
        } else {
          setErrorKey("generic");
        }
        setState("error");
      } catch {
        setErrorKey("generic");
        setState("error");
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    void verify();
    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [token]);

  const isLoading = state === "idle";
  const isSuccess = state === "success";

  const errorMessage = useMemo(() => dictionary.errors[errorKey], [dictionary.errors, errorKey]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center py-4 text-center">
        <h1 className="text-xl font-bold text-foreground">{dictionary.errorTitle}</h1>
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">{dictionary.errors.generic}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-4 text-center">
      {isSuccess ? (
        <>
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-8 ring-primary/5">
            <CheckCircle className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">{dictionary.successTitle}</h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            {dictionary.successDescription}
          </p>
          <Button asChild className="mt-6 w-full">
            <Link href={withLocale("/dashboard", locale)}>{dictionary.goToDashboard}</Link>
          </Button>
        </>
      ) : (
        <>
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 ring-8 ring-destructive/5">
            <XCircle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-xl font-bold text-foreground">{dictionary.errorTitle}</h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">{errorMessage}</p>
          <Button asChild variant="ghost" className="mt-6 w-full">
            <Link href={withLocale("/login", locale)}>{dictionary.backToLogin}</Link>
          </Button>
        </>
      )}
    </div>
  );
}

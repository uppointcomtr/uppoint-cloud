"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/ui/floating-input";
import { getLoginSchema } from "@/modules/auth/schemas/auth-schemas";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";

import { AuthCard } from "./auth-card";

interface ForgotPasswordRequestFormProps {
  locale: Locale;
  dictionary: Dictionary["forgotPassword"];
}

interface ForgotPasswordRequestInput {
  email: string;
}

interface ForgotPasswordRequestResponse {
  success: boolean;
  error?: string;
}

function mapError(
  errorCode: string | undefined,
  dictionary: ForgotPasswordRequestFormProps["dictionary"],
): string {
  switch (errorCode) {
    case "VALIDATION_FAILED":
    case "INVALID_BODY":
      return dictionary.errors.validationFailed;
    case "FORGOT_PASSWORD_REQUEST_FAILED":
      return dictionary.errors.unavailable;
    default:
      return dictionary.errors.generic;
  }
}

export function ForgotPasswordRequestForm({
  locale,
  dictionary,
}: ForgotPasswordRequestFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const form = useForm<ForgotPasswordRequestInput>({
    resolver: zodResolver(getLoginSchema(locale).pick({ email: true })),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    setIsSubmitting(true);
    setIsSuccess(false);

    let response: Response;

    try {
      response = await fetch("/api/auth/forgot-password/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: values.email,
          locale,
        }),
      });
    } catch {
      setSubmitError(dictionary.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

    let payload: ForgotPasswordRequestResponse;
    try {
      payload = (await response.json()) as ForgotPasswordRequestResponse;
    } catch {
      setSubmitError(dictionary.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

    if (!response.ok || !payload.success) {
      setSubmitError(mapError(payload.error, dictionary));
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    setIsSuccess(true);
  });

  return (
    <AuthCard
      title={dictionary.title}
      description={dictionary.description}
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
          {dictionary.backToLogin}
        </Link>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <div className="space-y-2">
          <FloatingInput
            id="email"
            type="email"
            label={dictionary.fields.email}
            autoComplete="email"
            {...form.register("email")}
          />
          {form.formState.errors.email ? (
            <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
          ) : null}
        </div>

        {submitError ? (
          <Alert variant="destructive">
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}

        {isSuccess ? (
          <Alert>
            <AlertDescription>{dictionary.successMessage}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? dictionary.submitLoading : dictionary.submitIdle}
        </Button>
      </form>
    </AuthCard>
  );
}

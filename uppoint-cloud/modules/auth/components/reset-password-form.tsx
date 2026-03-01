"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/ui/floating-input";
import { getRegisterSchema } from "@/modules/auth/schemas/auth-schemas";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";

import { AuthCard } from "./auth-card";

interface ResetPasswordFormProps {
  locale: Locale;
  dictionary: Dictionary["resetPassword"];
}

interface ResetPasswordResponse {
  success: boolean;
  error?: string;
}

function mapError(
  errorCode: string | undefined,
  dictionary: ResetPasswordFormProps["dictionary"],
): string {
  switch (errorCode) {
    case "INVALID_OR_EXPIRED_TOKEN":
      return dictionary.errors.invalidOrExpiredToken;
    case "VALIDATION_FAILED":
    case "INVALID_BODY":
      return dictionary.errors.validationFailed;
    case "RESET_PASSWORD_FAILED":
      return dictionary.errors.unavailable;
    default:
      return dictionary.errors.generic;
  }
}

export function ResetPasswordForm({ locale, dictionary }: ResetPasswordFormProps) {
  const searchParams = useSearchParams();
  const resetToken = searchParams.get("token") ?? "";
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const resetPasswordSchema = getRegisterSchema(locale)
    .pick({ password: true })
    .extend({
      confirmPassword: z
        .string()
        .trim()
        .min(1, dictionary.errors.confirmRequired),
    })
    .refine(
      (values) => values.password === values.confirmPassword,
      {
        path: ["confirmPassword"],
        message: dictionary.errors.confirmMismatch,
      },
    );

  type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    setIsSubmitting(true);
    setIsSuccess(false);

    if (!resetToken) {
      setSubmitError(dictionary.errors.invalidOrExpiredToken);
      setIsSubmitting(false);
      return;
    }

    let response: Response;

    try {
      response = await fetch("/api/auth/forgot-password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: resetToken,
          password: values.password,
        }),
      });
    } catch {
      setSubmitError(dictionary.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

    let payload: ResetPasswordResponse;
    try {
      payload = (await response.json()) as ResetPasswordResponse;
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
    form.reset();
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
        {!resetToken ? (
          <Alert variant="destructive">
            <AlertDescription>{dictionary.errors.invalidOrExpiredToken}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <FloatingInput
            id="password"
            type="password"
            label={dictionary.fields.password}
            autoComplete="new-password"
            {...form.register("password")}
          />
          {form.formState.errors.password ? (
            <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <FloatingInput
            id="confirmPassword"
            type="password"
            label={dictionary.fields.confirmPassword}
            autoComplete="new-password"
            {...form.register("confirmPassword")}
          />
          {form.formState.errors.confirmPassword ? (
            <p className="text-sm text-destructive">{form.formState.errors.confirmPassword.message}</p>
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

        <Button type="submit" className="w-full" disabled={isSubmitting || !resetToken}>
          {isSubmitting ? dictionary.submitLoading : dictionary.submitIdle}
        </Button>
      </form>
    </AuthCard>
  );
}

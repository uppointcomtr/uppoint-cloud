"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/ui/floating-input";
import { getLoginSchema, type LoginInput } from "@/modules/auth/schemas/auth-schemas";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";

import { AuthCard } from "./auth-card";
import { ForgotPasswordModal } from "./forgot-password-modal";

interface LoginFormProps {
  locale: Locale;
  dictionary: Dictionary["login"];
  passwordRecoveryDictionary: Dictionary["passwordRecovery"];
  validation: Dictionary["validation"];
}

export function LoginForm({
  locale,
  dictionary,
  passwordRecoveryDictionary,
  validation,
}: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? withLocale("/dashboard", locale);
  const [step, setStep] = useState<"identifier" | "password">("identifier");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [recoveryModalVersion, setRecoveryModalVersion] = useState(0);

  const form = useForm<LoginInput>({
    resolver: zodResolver(getLoginSchema(locale)),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const submitCredentials = form.handleSubmit(async (values) => {
    setSubmitError(null);
    setIsSubmitting(true);

    let result: Awaited<ReturnType<typeof signIn>> | undefined;

    try {
      result = await signIn("credentials", {
        ...values,
        redirect: false,
        callbackUrl,
      });
    } catch {
      setSubmitError(dictionary.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);

    if (!result || result.error) {
      setSubmitError(dictionary.errors.invalidCredentials);
      return;
    }

    router.push(result.url ?? withLocale("/dashboard", locale));
    router.refresh();
  });

  async function continueToPasswordStep() {
    setSubmitError(null);
    const isEmailValid = await form.trigger("email");

    if (!isEmailValid) {
      return;
    }

    setStep("password");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (step === "identifier") {
      await continueToPasswordStep();
      return;
    }

    await submitCredentials(event);
  }

  return (
    <AuthCard
      title={dictionary.title}
      description={dictionary.description}
      surface="plain"
      titleClassName="text-2xl leading-8"
      footer={
        <p className="text-sm text-muted-foreground">
          {dictionary.footerPrefix}{" "}
          <Link
            href={withLocale("/register", locale)}
            className="text-primary underline-offset-4 hover:underline"
          >
            {dictionary.footerLink}
          </Link>
        </p>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        {step === "identifier" ? (
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
        ) : (
          <>
            <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {dictionary.accountPrefix}
              </p>
              <p className="mt-1 break-all text-sm font-semibold text-foreground">
                {form.getValues("email")}
              </p>
            </div>

            <div className="space-y-2">
              <FloatingInput
                id="password"
                type="password"
                label={dictionary.fields.password}
                autoComplete="current-password"
                {...form.register("password")}
              />
              {form.formState.errors.password ? (
                <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => {
                setRecoveryModalVersion((current) => current + 1);
                setIsRecoveryModalOpen(true);
              }}
              className="inline-block text-sm text-primary underline-offset-4 hover:underline"
            >
              {dictionary.forgotPasswordLink}
            </button>
          </>
        )}

        {submitError ? (
          <Alert variant="destructive">
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}

        {step === "identifier" ? (
          <Button type="submit" className="w-full">
            {dictionary.nextIdle}
          </Button>
        ) : (
          <div className="space-y-2">
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? dictionary.submitLoading : dictionary.submitIdle}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setSubmitError(null);
                form.clearErrors("password");
                setStep("identifier");
              }}
            >
              {dictionary.backIdle}
            </Button>
          </div>
        )}
      </form>

      {isRecoveryModalOpen ? (
        <ForgotPasswordModal
          key={recoveryModalVersion}
          open={isRecoveryModalOpen}
          onOpenChange={setIsRecoveryModalOpen}
          locale={locale}
          dictionary={passwordRecoveryDictionary}
          validation={validation}
          initialEmail={form.getValues("email")}
        />
      ) : null}
    </AuthCard>
  );
}

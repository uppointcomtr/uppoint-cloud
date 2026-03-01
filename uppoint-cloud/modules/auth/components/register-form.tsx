"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch, Controller, type Resolver } from "react-hook-form";

import { Check, CheckCircle, X } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/ui/floating-input";
import { Label } from "@/components/ui/label";
import { getRegisterSchema, type RegisterInput } from "@/modules/auth/schemas/auth-schemas";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";

import { AuthCard } from "./auth-card";
import { PhoneInput } from "./phone-input";

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    window.clearTimeout(timer);
  });
}

interface RegisterResponse {
  success: boolean;
  data?: {
    userId: string;
  };
  error?: string;
}

interface RegisterFormProps {
  locale: Locale;
  dictionary: Dictionary["register"];
  validation: Dictionary["validation"];
  apiErrors: Dictionary["apiErrors"];
}

function mapApiErrorCode(
  errorCode: string | undefined,
  dictionary: RegisterFormProps["dictionary"],
  apiErrors: RegisterFormProps["apiErrors"],
): string {
  switch (errorCode) {
    case apiErrors.invalidBody:
      return dictionary.errors.invalidBody;
    case apiErrors.validationFailed:
      return dictionary.errors.validationFailed;
    case apiErrors.emailTaken:
      return dictionary.errors.emailTaken;
    case apiErrors.registerFailed:
      return dictionary.errors.generic;
    default:
      return dictionary.errors.generic;
  }
}

export function RegisterForm({ locale, dictionary, validation, apiErrors }: RegisterFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "details" | "success">("email");
  const [successRedirectUrl, setSuccessRedirectUrl] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<RegisterInput>({
    resolver: zodResolver(getRegisterSchema(locale)) as Resolver<RegisterInput>,
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      password: "",
    },
  });

  const password = useWatch({ control: form.control, name: "password" }) ?? "";

  const passwordRules = [
    { met: password.length >= 12,        label: validation.passwordRuleMin },
    { met: /[A-Z]/.test(password),       label: validation.passwordRuleUppercase },
    { met: /[a-z]/.test(password),       label: validation.passwordRuleLowercase },
    { met: /[0-9]/.test(password),       label: validation.passwordRuleNumber },
    { met: /[^A-Za-z0-9]/.test(password), label: validation.passwordRuleSymbol },
  ];

  const submitRegistration = form.handleSubmit(async (values) => {
    if (isSubmitting) return;
    setSubmitError(null);
    setIsSubmitting(true);

    let response: Response;

    try {
      response = await fetchWithTimeout("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, locale }),
      });
    } catch {
      setSubmitError(dictionary.errors.serverUnavailable);
      setIsSubmitting(false);
      return;
    }

    let payload: RegisterResponse;
    try {
      payload = await response.json();
    } catch {
      setSubmitError(dictionary.errors.serverUnavailable);
      setIsSubmitting(false);
      return;
    }

    if (!response.ok || !payload.success) {
      setSubmitError(mapApiErrorCode(payload.error, dictionary, apiErrors));
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    const loginUrl = new URL(withLocale("/login", locale), window.location.origin);
    loginUrl.searchParams.set("email", values.email);
    setSuccessRedirectUrl(`${loginUrl.pathname}${loginUrl.search}`);
    setStep("success");
    router.refresh();
  });

  async function continueToDetailsStep() {
    setSubmitError(null);
    const isEmailValid = await form.trigger("email");
    if (!isEmailValid) return;
    setStep("details");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === "email") {
      await continueToDetailsStep();
      return;
    }
    await submitRegistration(event);
  }

  if (step === "success") {
    return (
      <div className="flex flex-col items-center py-4 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-8 ring-primary/5">
          <CheckCircle className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-foreground">{dictionary.successTitle}</h2>
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">
          {dictionary.successDescription}
        </p>
        <Button
          type="button"
          className="mt-6 w-full"
          onClick={() => {
            if (successRedirectUrl) {
              router.push(successRedirectUrl);
            }
          }}
        >
          {dictionary.goToDashboard}
        </Button>
      </div>
    );
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
            href={withLocale("/login", locale)}
            className="text-primary underline-offset-4 hover:underline"
          >
            {dictionary.footerLink}
          </Link>
        </p>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        {step === "email" ? (
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
                {dictionary.emailPrefix}
              </p>
              <p className="mt-1 break-all text-sm font-semibold text-foreground">
                {form.getValues("email")}
              </p>
            </div>

            <div className="space-y-2">
              <FloatingInput
                id="name"
                label={dictionary.fields.name}
                autoComplete="name"
                {...form.register("name")}
              />
              {form.formState.errors.name ? (
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="sr-only">{dictionary.fields.phone}</Label>
              <Controller
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <PhoneInput
                    id="phone"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
              {form.formState.errors.phone ? (
                <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <FloatingInput
                id="password"
                type="password"
                label={dictionary.fields.password}
                autoComplete="new-password"
                {...form.register("password")}
              />
              {password.length > 0 && (
                <ul className="mt-1.5 grid grid-cols-1 gap-y-1">
                  {passwordRules.map((rule) => (
                    <li key={rule.label} className={`flex items-center gap-1.5 text-xs transition-colors ${rule.met ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                      {rule.met
                        ? <Check className="h-3 w-3 shrink-0" />
                        : <X className="h-3 w-3 shrink-0" />}
                      {rule.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {submitError ? (
          <Alert variant="destructive">
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}

        {step === "email" ? (
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
                form.clearErrors();
                setStep("email");
              }}
            >
              {dictionary.backIdle}
            </Button>
          </div>
        )}
      </form>
    </AuthCard>
  );
}

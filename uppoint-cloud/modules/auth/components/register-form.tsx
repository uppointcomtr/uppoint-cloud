"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useForm, useWatch, Controller, type Resolver } from "react-hook-form";

import { Info } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getRegisterSchema, type RegisterInput } from "@/modules/auth/schemas/auth-schemas";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";

import { AuthCard } from "./auth-card";
import { PhoneInput } from "./phone-input";

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
  const [step, setStep] = useState<"email" | "details">("email");
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

  const rulesMetCount = [
    password.length >= 12,
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;

  const strengthLevel =
    password.length === 0 ? null :
    rulesMetCount <= 2 ? "weak" :
    rulesMetCount <= 4 ? "medium" : "strong";

  const submitRegistration = form.handleSubmit(async (values) => {
    setSubmitError(null);
    setIsSubmitting(true);

    let response: Response;

    try {
      response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
    } catch {
      setSubmitError(dictionary.errors.serverUnavailable);
      setIsSubmitting(false);
      return;
    }

    const payload: RegisterResponse = await response.json();

    if (!response.ok || !payload.success) {
      setSubmitError(mapApiErrorCode(payload.error, dictionary, apiErrors));
      setIsSubmitting(false);
      return;
    }

    let signInResult: Awaited<ReturnType<typeof signIn>> | undefined;

    try {
      signInResult = await signIn("credentials", {
        email: values.email,
        password: values.password,
        redirect: false,
        callbackUrl: withLocale("/dashboard", locale),
      });
    } catch {
      setSubmitError(dictionary.errors.autoSignInFailed);
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);

    if (!signInResult || signInResult.error) {
      router.push(withLocale("/login", locale));
      router.refresh();
      return;
    }

    router.push(signInResult.url ?? withLocale("/dashboard", locale));
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
            <Label htmlFor="email">{dictionary.fields.email}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              {...form.register("email")}
            />
            {form.formState.errors.email ? (
              <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
            ) : null}
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{dictionary.emailPrefix}</p>
              <p className="text-sm font-medium break-all">{form.getValues("email")}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">{dictionary.fields.name}</Label>
              <Input id="name" autoComplete="name" {...form.register("name")} />
              {form.formState.errors.name ? (
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">{dictionary.fields.phone}</Label>
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
              <Label htmlFor="password">{dictionary.fields.password}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                {...form.register("password")}
              />
              {strengthLevel !== null && (
                <div className="flex items-center gap-2 pt-1">
                  <div className="flex flex-1 gap-1">
                    {([0, 1, 2] as const).map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          strengthLevel === "weak"   && i === 0 ? "bg-red-500"    :
                          strengthLevel === "medium" && i <= 1  ? "bg-yellow-500" :
                          strengthLevel === "strong"            ? "bg-green-500"  : "bg-muted"
                        }`}
                      />
                    ))}
                  </div>
                  <span className={`text-xs font-medium ${
                    strengthLevel === "weak"   ? "text-red-500"                :
                    strengthLevel === "medium" ? "text-yellow-500"             :
                                                 "text-green-600 dark:text-green-400"
                  }`}>
                    {strengthLevel === "weak"   ? validation.passwordStrengthWeak   :
                     strengthLevel === "medium" ? validation.passwordStrengthMedium :
                                                  validation.passwordStrengthStrong}
                  </span>
                </div>
              )}
              <p className="flex items-start gap-1 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                {validation.passwordHint}
              </p>
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

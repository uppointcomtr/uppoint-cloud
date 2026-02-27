"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useForm, type Resolver } from "react-hook-form";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getRegisterSchema, type RegisterInput } from "@/modules/auth/schemas/auth-schemas";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";

import { AuthCard } from "./auth-card";

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

export function RegisterForm({ locale, dictionary, apiErrors }: RegisterFormProps) {
  const router = useRouter();
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

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    setIsSubmitting(true);

    let response: Response;

    try {
      response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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

  return (
    <AuthCard
      title={dictionary.title}
      description={dictionary.description}
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
        <div className="space-y-2">
          <Label htmlFor="name">{dictionary.fields.name}</Label>
          <Input id="name" autoComplete="name" {...form.register("name")} />
          {form.formState.errors.name ? (
            <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
          ) : null}
        </div>

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

        <div className="space-y-2">
          <Label htmlFor="phone">{dictionary.fields.phone}</Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder={dictionary.fields.phonePlaceholder}
            {...form.register("phone")}
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
          {form.formState.errors.password ? (
            <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
          ) : null}
        </div>

        {submitError ? (
          <Alert variant="destructive">
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? dictionary.submitLoading : dictionary.submitIdle}
        </Button>
      </form>
    </AuthCard>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch, Controller, type Resolver } from "react-hook-form";
import { Check, CheckCircle, Clock, Mail, Smartphone, X } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/ui/floating-input";
import { Label } from "@/components/ui/label";
import { getLoginOtpSchema, getRegisterSchema, type RegisterInput } from "@/modules/auth/schemas/auth-schemas";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";

import { AuthCard } from "./auth-card";
import { PhoneInput } from "./phone-input";
import { VerificationCodeInput } from "./verification-code-input";

type RegisterStep = "email" | "details" | "verifyEmailCode" | "verifySmsCode" | "success";
const REGISTER_CODE_TTL_SECONDS = 3 * 60;

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    window.clearTimeout(timer);
  });
}

function formatCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutesPart = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, "0");
  const secondsPart = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutesPart}:${secondsPart}`;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface RegisterFormProps {
  locale: Locale;
  dictionary: Dictionary["register"];
  validation: Dictionary["validation"];
  apiErrors: Dictionary["apiErrors"];
}

function mapRegisterStartError(
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
    case "REGISTER_VERIFICATION_START_FAILED":
      return dictionary.errors.verificationStartFailed;
    case apiErrors.registerFailed:
      return dictionary.errors.generic;
    default:
      return dictionary.errors.generic;
  }
}

function mapRegisterVerificationError(
  errorCode: string | undefined,
  dictionary: RegisterFormProps["dictionary"],
): string {
  switch (errorCode) {
    case "INVALID_BODY":
    case "VALIDATION_FAILED":
      return dictionary.errors.validationFailed;
    case "INVALID_OR_EXPIRED_CHALLENGE":
      return dictionary.errors.expiredChallenge;
    case "INVALID_EMAIL_CODE":
      return dictionary.errors.invalidEmailCode;
    case "INVALID_SMS_CODE":
      return dictionary.errors.invalidSmsCode;
    case "MAX_ATTEMPTS_REACHED":
      return dictionary.errors.maxAttempts;
    case "PHONE_NOT_AVAILABLE":
      return dictionary.errors.noPhone;
    case "SMS_NOT_ENABLED":
      return dictionary.errors.smsDisabled;
    case "SMS_DELIVERY_FAILED":
      return dictionary.errors.smsDeliveryFailed;
    case "REGISTER_VERIFY_EMAIL_FAILED":
    case "REGISTER_VERIFY_SMS_FAILED":
    case "REGISTER_VERIFY_RESTART_FAILED":
      return dictionary.errors.verificationUnavailable;
    default:
      return dictionary.errors.verificationUnavailable;
  }
}

export function RegisterForm({ locale, dictionary, validation, apiErrors }: RegisterFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<RegisterStep>("email");
  const [successRedirectUrl, setSuccessRedirectUrl] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitInfo, setSubmitInfo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [emailCode, setEmailCode] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [maskedPhone, setMaskedPhone] = useState<string | null>(null);
  const [expiresAtTimestamp, setExpiresAtTimestamp] = useState<number | null>(null);
  const [nowTimestamp, setNowTimestamp] = useState(0);

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

  const countdownSeconds = useMemo(() => {
    if (!expiresAtTimestamp) {
      return null;
    }

    return Math.floor((expiresAtTimestamp - nowTimestamp) / 1000);
  }, [expiresAtTimestamp, nowTimestamp]);

  const isCodeExpired = countdownSeconds !== null && countdownSeconds <= 0;

  useEffect(() => {
    if (step !== "verifyEmailCode" && step !== "verifySmsCode") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNowTimestamp((previous) => previous + 1000);
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [step]);

  const passwordRules = [
    { met: password.length >= 12, label: validation.passwordRuleMin },
    { met: /[A-Z]/.test(password), label: validation.passwordRuleUppercase },
    { met: /[a-z]/.test(password), label: validation.passwordRuleLowercase },
    { met: /[0-9]/.test(password), label: validation.passwordRuleNumber },
    { met: /[^A-Za-z0-9]/.test(password), label: validation.passwordRuleSymbol },
  ];

  const submitRegistration = form.handleSubmit(async (values) => {
    if (isSubmitting) return;
    setSubmitError(null);
    setSubmitInfo(null);
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

    let payload: ApiResponse<{
      accepted?: boolean;
      hasChallenge?: boolean;
      challengeId?: string | null;
      emailCodeExpiresAt?: string | null;
    }>;

    try {
      payload = await response.json() as typeof payload;
    } catch {
      setSubmitError(dictionary.errors.serverUnavailable);
      setIsSubmitting(false);
      return;
    }

    if (!response.ok || !payload.success || !payload.data) {
      setSubmitError(mapRegisterStartError(payload.error, dictionary, apiErrors));
      setIsSubmitting(false);
      return;
    }

    if (payload.data.accepted && payload.data.hasChallenge === false) {
      setSubmitInfo(dictionary.verification.accountExists);
      setIsSubmitting(false);
      return;
    }

    if (!payload.data.challengeId || !payload.data.emailCodeExpiresAt) {
      setSubmitError(dictionary.errors.verificationStartFailed);
      setIsSubmitting(false);
      return;
    }

    const emailCodeExpiresAtTs = new Date(payload.data.emailCodeExpiresAt).getTime();

    setChallengeId(payload.data.challengeId);
    setExpiresAtTimestamp(emailCodeExpiresAtTs);
    setNowTimestamp(emailCodeExpiresAtTs - REGISTER_CODE_TTL_SECONDS * 1000);
    setEmailCode("");
    setSmsCode("");
    setMaskedPhone(null);
    setSubmitInfo(dictionary.verification.emailCodeSent);
    setStep("verifyEmailCode");
    setIsSubmitting(false);
  });

  async function restartVerificationFlow() {
    if (isSubmitting) return;

    if (!challengeId) {
      setSubmitError(dictionary.errors.verificationUnavailable);
      return;
    }

    setSubmitError(null);
    setSubmitInfo(null);
    setIsSubmitting(true);

    let response: Response;
    try {
      response = await fetchWithTimeout("/api/auth/register/challenge/restart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId,
          locale,
        }),
      });
    } catch {
      setSubmitError(dictionary.errors.verificationUnavailable);
      setIsSubmitting(false);
      return;
    }

    let payload: ApiResponse<{ challengeId: string; emailCodeExpiresAt: string }>;
    try {
      payload = await response.json() as typeof payload;
    } catch {
      setSubmitError(dictionary.errors.verificationUnavailable);
      setIsSubmitting(false);
      return;
    }

    if (!response.ok || !payload.success || !payload.data?.challengeId || !payload.data?.emailCodeExpiresAt) {
      setSubmitError(mapRegisterVerificationError(payload.error, dictionary));
      setIsSubmitting(false);
      return;
    }

    const emailCodeExpiresAtTs = new Date(payload.data.emailCodeExpiresAt).getTime();

    setChallengeId(payload.data.challengeId);
    setExpiresAtTimestamp(emailCodeExpiresAtTs);
    setNowTimestamp(emailCodeExpiresAtTs - REGISTER_CODE_TTL_SECONDS * 1000);
    setEmailCode("");
    setSmsCode("");
    setMaskedPhone(null);
    setSubmitInfo(dictionary.verification.emailCodeResent);
    setStep("verifyEmailCode");
    setIsSubmitting(false);
  }

  async function verifyEmailChallenge() {
    if (isSubmitting) return;
    setSubmitError(null);
    setSubmitInfo(null);

    if (!challengeId || isCodeExpired) {
      setSubmitError(dictionary.errors.expiredChallenge);
      return;
    }

    const parsedCode = getLoginOtpSchema(locale).safeParse({ code: emailCode });
    if (!parsedCode.success) {
      setSubmitError(parsedCode.error.issues[0]?.message ?? dictionary.errors.validationFailed);
      return;
    }

    setIsSubmitting(true);

    let response: Response;
    try {
      response = await fetchWithTimeout("/api/auth/register/challenge/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId,
          emailCode: parsedCode.data.code,
          locale,
        }),
      });
    } catch {
      setSubmitError(dictionary.errors.verificationUnavailable);
      setIsSubmitting(false);
      return;
    }

    let payload: ApiResponse<{ smsCodeExpiresAt: string; maskedPhone: string }>;
    try {
      payload = await response.json() as typeof payload;
    } catch {
      setSubmitError(dictionary.errors.verificationUnavailable);
      setIsSubmitting(false);
      return;
    }

    if (!response.ok || !payload.success || !payload.data?.smsCodeExpiresAt) {
      setSubmitError(mapRegisterVerificationError(payload.error, dictionary));
      setIsSubmitting(false);
      return;
    }

    const smsCodeExpiresAtTs = new Date(payload.data.smsCodeExpiresAt).getTime();

    setMaskedPhone(payload.data.maskedPhone);
    setExpiresAtTimestamp(smsCodeExpiresAtTs);
    setNowTimestamp(smsCodeExpiresAtTs - REGISTER_CODE_TTL_SECONDS * 1000);
    setSmsCode("");
    setSubmitInfo(dictionary.verification.smsCodeSent);
    setStep("verifySmsCode");
    setIsSubmitting(false);
  }

  async function verifySmsChallenge() {
    if (isSubmitting) return;
    setSubmitError(null);
    setSubmitInfo(null);

    if (!challengeId || isCodeExpired) {
      setSubmitError(dictionary.errors.expiredChallenge);
      return;
    }

    const parsedCode = getLoginOtpSchema(locale).safeParse({ code: smsCode });
    if (!parsedCode.success) {
      setSubmitError(parsedCode.error.issues[0]?.message ?? dictionary.errors.validationFailed);
      return;
    }

    setIsSubmitting(true);

    let response: Response;
    try {
      response = await fetchWithTimeout("/api/auth/register/challenge/verify-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId,
          smsCode: parsedCode.data.code,
        }),
      });
    } catch {
      setSubmitError(dictionary.errors.verificationUnavailable);
      setIsSubmitting(false);
      return;
    }

    let payload: ApiResponse<{ verified: true }>;
    try {
      payload = await response.json() as typeof payload;
    } catch {
      setSubmitError(dictionary.errors.verificationUnavailable);
      setIsSubmitting(false);
      return;
    }

    if (!response.ok || !payload.success) {
      setSubmitError(mapRegisterVerificationError(payload.error, dictionary));
      setIsSubmitting(false);
      return;
    }

    const loginUrl = new URL(withLocale("/login", locale), window.location.origin);
    loginUrl.searchParams.set("email", form.getValues("email"));
    setSuccessRedirectUrl(`${loginUrl.pathname}${loginUrl.search}`);
    setStep("success");
    setIsSubmitting(false);
  }

  async function continueToDetailsStep() {
    setSubmitError(null);
    setSubmitInfo(null);
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

    if (step === "details") {
      await submitRegistration(event);
      return;
    }

    if (step === "verifyEmailCode") {
      await verifyEmailChallenge();
      return;
    }

    if (step === "verifySmsCode") {
      await verifySmsChallenge();
    }
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
        ) : null}

        {step === "details" ? (
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
                    <li
                      key={rule.label}
                      className={`flex items-center gap-1.5 text-xs transition-colors ${rule.met ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}
                    >
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
        ) : null}

        {step === "verifyEmailCode" ? (
          <>
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 text-primary" />
                <span>{form.getValues("email")}</span>
              </div>
              {countdownSeconds !== null ? (
                <div className="flex items-center gap-2 text-xs font-medium text-primary">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{dictionary.countdownPrefix} {formatCountdown(countdownSeconds)}</span>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <VerificationCodeInput
                id="register-email-code"
                value={emailCode}
                onChange={setEmailCode}
                placeholder={dictionary.fields.emailCode}
                autoFocus
              />
            </div>
          </>
        ) : null}

        {step === "verifySmsCode" ? (
          <>
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Smartphone className="h-4 w-4 text-primary" />
                <span>{dictionary.verification.smsSentToPrefix}: {maskedPhone ?? "****"}</span>
              </div>
              {countdownSeconds !== null ? (
                <div className="flex items-center gap-2 text-xs font-medium text-primary">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{dictionary.countdownPrefix} {formatCountdown(countdownSeconds)}</span>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <VerificationCodeInput
                id="register-sms-code"
                value={smsCode}
                onChange={setSmsCode}
                placeholder={dictionary.fields.smsCode}
                autoFocus
              />
            </div>
          </>
        ) : null}

        {submitInfo ? (
          <Alert>
            <AlertDescription>{submitInfo}</AlertDescription>
          </Alert>
        ) : null}

        {submitError ? (
          <Alert variant="destructive">
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}

        {step === "email" ? (
          <Button type="submit" className="w-full">
            {dictionary.nextIdle}
          </Button>
        ) : null}

        {step === "details" ? (
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
                setSubmitInfo(null);
                form.clearErrors();
                setStep("email");
              }}
            >
              {dictionary.backIdle}
            </Button>
          </div>
        ) : null}

        {step === "verifyEmailCode" ? (
          <div className="space-y-2">
            <Button type="submit" className="w-full" disabled={isSubmitting || isCodeExpired}>
              {isSubmitting ? dictionary.verification.verifyEmailCodeLoading : dictionary.verification.verifyEmailCodeIdle}
            </Button>
            {isCodeExpired ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={isSubmitting}
                onClick={restartVerificationFlow}
              >
                {dictionary.verification.resendCodeIdle}
              </Button>
            ) : null}
          </div>
        ) : null}

        {step === "verifySmsCode" ? (
          <div className="space-y-2">
            <Button type="submit" className="w-full" disabled={isSubmitting || isCodeExpired}>
              {isSubmitting ? dictionary.verification.verifySmsCodeLoading : dictionary.verification.verifySmsCodeIdle}
            </Button>
            {isCodeExpired ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={isSubmitting}
                onClick={restartVerificationFlow}
              >
                {dictionary.verification.resendCodeIdle}
              </Button>
            ) : null}
          </div>
        ) : null}
      </form>
    </AuthCard>
  );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";

import { Clock, Mail, Smartphone } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/ui/floating-input";
import { cn } from "@/lib/utils";
import {
  getLoginOtpSchema,
  getLoginSchema,
  getPhoneLoginSchema,
} from "@/modules/auth/schemas/auth-schemas";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";

import { AuthCard } from "./auth-card";
import { ForgotPasswordModal } from "./forgot-password-modal";
import { PhoneInput } from "./phone-input";

type LoginMode = "email" | "phone";
type EmailStep = "identifier" | "password" | "otp";
type PhoneStep = "identifier" | "password" | "otp";

interface LoginFormProps {
  locale: Locale;
  dictionary: Dictionary["login"];
  passwordRecoveryDictionary: Dictionary["passwordRecovery"];
  validation: Dictionary["validation"];
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

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

function mapLoginChallengeError(
  errorCode: string | undefined,
  dictionary: Dictionary["login"],
): string {
  switch (errorCode) {
    case "INVALID_BODY":
    case "VALIDATION_FAILED":
      return dictionary.errors.unavailable;
    case "INVALID_CODE":
      return dictionary.errors.invalidCode;
    case "INVALID_OR_EXPIRED_CHALLENGE":
      return dictionary.errors.expiredCode;
    case "MAX_ATTEMPTS_REACHED":
      return dictionary.errors.maxAttempts;
    case "SMS_NOT_ENABLED":
      return dictionary.errors.smsDisabled;
    case "EMAIL_DELIVERY_FAILED":
      return dictionary.errors.emailDeliveryFailed;
    case "LOGIN_CHALLENGE_START_FAILED":
    case "LOGIN_CHALLENGE_VERIFY_FAILED":
      return dictionary.errors.unavailable;
    default:
      return dictionary.errors.unavailable;
  }
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

  const [mode, setMode] = useState<LoginMode>("email");
  const [emailStep, setEmailStep] = useState<EmailStep>("identifier");
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("identifier");

  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [phonePassword, setPhonePassword] = useState("");
  const [otpCode, setOtpCode] = useState("");

  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [expiresAtTimestamp, setExpiresAtTimestamp] = useState<number | null>(null);
  const [nowTimestamp, setNowTimestamp] = useState(0);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitInfo, setSubmitInfo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [recoveryModalVersion, setRecoveryModalVersion] = useState(0);

  const countdownSeconds = useMemo(() => {
    if (!expiresAtTimestamp) {
      return null;
    }

    return Math.floor((expiresAtTimestamp - nowTimestamp) / 1000);
  }, [expiresAtTimestamp, nowTimestamp]);

  const isCodeExpired = countdownSeconds !== null && countdownSeconds <= 0;

  useEffect(() => {
    const isOtpStep = (mode === "email" && emailStep === "otp") || (mode === "phone" && phoneStep === "otp");

    if (!isOtpStep) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [mode, emailStep, phoneStep]);

  function resetFlowState(nextMode: LoginMode) {
    setMode(nextMode);
    setSubmitError(null);
    setSubmitInfo(null);
    setIsSubmitting(false);
    setChallengeId(null);
    setOtpCode("");
    setExpiresAtTimestamp(null);
    setNowTimestamp(0);
    setEmailStep("identifier");
    setPhoneStep("identifier");
    setEmailPassword("");
    setPhonePassword("");
  }

  async function signInWithToken(loginToken: string) {
    let result: Awaited<ReturnType<typeof signIn>> | undefined;

    try {
      result = await signIn("credentials", {
        loginToken,
        redirect: false,
        callbackUrl,
      });
    } catch {
      setSubmitError(dictionary.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

    if (!result || result.error) {
      setSubmitError(dictionary.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    router.push(result.url ?? withLocale("/dashboard", locale));
    router.refresh();
  }

  async function startEmailChallenge() {
    if (isSubmitting) return;
    setSubmitError(null);
    setSubmitInfo(null);

    const credentialSchema = getLoginSchema(locale);
    const parsed = credentialSchema.safeParse({ email, password: emailPassword });

    if (!parsed.success) {
      setSubmitError(parsed.error.issues[0]?.message ?? dictionary.errors.unavailable);
      return;
    }

    setIsSubmitting(true);

    let response: Response;

    try {
      response = await fetchWithTimeout("/api/auth/login/challenge/email/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: parsed.data.email,
          password: parsed.data.password,
          locale,
        }),
      });
    } catch {
      setSubmitError(dictionary.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

    const payload = (await response.json()) as ApiResponse<{
      hasChallenge: boolean;
      challengeId: string | null;
      codeExpiresAt: string | null;
    }>;

    if (!response.ok || !payload.success || !payload.data) {
      setSubmitError(mapLoginChallengeError(payload.error, dictionary));
      setIsSubmitting(false);
      return;
    }

    if (!payload.data.hasChallenge || !payload.data.challengeId || !payload.data.codeExpiresAt) {
      setSubmitError(dictionary.errors.invalidCredentials);
      setIsSubmitting(false);
      return;
    }

    setChallengeId(payload.data.challengeId);
    setExpiresAtTimestamp(new Date(payload.data.codeExpiresAt).getTime());
    setNowTimestamp(Date.now());
    setOtpCode("");
    setEmailStep("otp");
    setIsSubmitting(false);
  }

  async function verifyEmailChallenge() {
    if (isSubmitting) return;
    setSubmitError(null);

    if (!challengeId) {
      setSubmitError(dictionary.errors.expiredCode);
      return;
    }

    const parsedCode = getLoginOtpSchema(locale).safeParse({ code: otpCode });

    if (!parsedCode.success) {
      setSubmitError(parsedCode.error.issues[0]?.message ?? validation.otpCodeFormat);
      return;
    }

    if (isCodeExpired) {
      setSubmitError(dictionary.errors.expiredCode);
      return;
    }

    setIsSubmitting(true);

    let response: Response;

    try {
      response = await fetchWithTimeout("/api/auth/login/challenge/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId,
          code: parsedCode.data.code,
        }),
      });
    } catch {
      setSubmitError(dictionary.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

    const payload = (await response.json()) as ApiResponse<{ loginToken: string }>;

    if (!response.ok || !payload.success || !payload.data) {
      setSubmitError(mapLoginChallengeError(payload.error, dictionary));
      setIsSubmitting(false);
      return;
    }

    await signInWithToken(payload.data.loginToken);
  }

  async function startPhoneChallenge() {
    if (isSubmitting) return;
    setSubmitError(null);
    setSubmitInfo(null);

    const parsedPhone = getPhoneLoginSchema(locale).safeParse({ phone });
    const parsedPassword = getLoginSchema(locale).shape.password.safeParse(phonePassword);

    if (!parsedPhone.success) {
      setSubmitError(parsedPhone.error.issues[0]?.message ?? validation.phoneFormat);
      return;
    }

    if (!parsedPassword.success) {
      setSubmitError(parsedPassword.error.issues[0]?.message ?? dictionary.errors.invalidCredentials);
      return;
    }

    setIsSubmitting(true);

    let response: Response;

    try {
      response = await fetchWithTimeout("/api/auth/login/challenge/phone/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: parsedPhone.data.phone,
          password: parsedPassword.data,
          locale,
        }),
      });
    } catch {
      setSubmitError(dictionary.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

    const payload = (await response.json()) as ApiResponse<{
      hasChallenge: boolean;
      challengeId: string | null;
      codeExpiresAt: string | null;
    }>;

    if (!response.ok || !payload.success || !payload.data) {
      setSubmitError(mapLoginChallengeError(payload.error, dictionary));
      setIsSubmitting(false);
      return;
    }

    if (!payload.data.hasChallenge || !payload.data.challengeId || !payload.data.codeExpiresAt) {
      setSubmitInfo(dictionary.acceptanceInfo);
      setIsSubmitting(false);
      return;
    }

    setChallengeId(payload.data.challengeId);
    setExpiresAtTimestamp(new Date(payload.data.codeExpiresAt).getTime());
    setNowTimestamp(Date.now());
    setOtpCode("");
    setPhoneStep("otp");
    setSubmitInfo(dictionary.acceptanceInfo);
    setIsSubmitting(false);
  }

  async function verifyPhoneChallenge() {
    if (isSubmitting) return;
    setSubmitError(null);

    if (!challengeId) {
      setSubmitError(dictionary.errors.expiredCode);
      return;
    }

    const parsedCode = getLoginOtpSchema(locale).safeParse({ code: otpCode });

    if (!parsedCode.success) {
      setSubmitError(parsedCode.error.issues[0]?.message ?? validation.otpCodeFormat);
      return;
    }

    if (isCodeExpired) {
      setSubmitError(dictionary.errors.expiredCode);
      return;
    }

    setIsSubmitting(true);

    let response: Response;

    try {
      response = await fetchWithTimeout("/api/auth/login/challenge/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId,
          code: parsedCode.data.code,
        }),
      });
    } catch {
      setSubmitError(dictionary.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

    const payload = (await response.json()) as ApiResponse<{ loginToken: string }>;

    if (!response.ok || !payload.success || !payload.data) {
      setSubmitError(mapLoginChallengeError(payload.error, dictionary));
      setIsSubmitting(false);
      return;
    }

    await signInWithToken(payload.data.loginToken);
  }

  const currentStepIndex =
    mode === "email"
      ? emailStep === "identifier" ? 0 : emailStep === "password" ? 1 : 2
      : phoneStep === "identifier" ? 0 : phoneStep === "password" ? 1 : 2;

  const activeStepLabel =
    mode === "email"
      ? emailStep === "identifier"
        ? dictionary.steps.identifier
        : emailStep === "password"
          ? dictionary.steps.password
          : dictionary.steps.otp
      : phoneStep === "identifier"
        ? dictionary.steps.identifier
        : phoneStep === "password"
          ? dictionary.steps.password
          : dictionary.steps.otp;

  const isOtpStep =
    (mode === "email" && emailStep === "otp") ||
    (mode === "phone" && phoneStep === "otp");

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
      <div className="space-y-4">
        {/* Mode tabs */}
        <div className="relative grid grid-cols-2 rounded-xl border border-border/60 bg-muted/30 p-1">
          <span
            aria-hidden
            className={cn(
              "absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded-lg bg-background shadow-sm transition-transform duration-300",
              mode === "phone" ? "translate-x-full" : "translate-x-0",
            )}
          />
          <button
            type="button"
            className={cn(
              "relative z-10 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              mode === "email" ? "text-foreground" : "text-muted-foreground",
            )}
            onClick={() => resetFlowState("email")}
          >
            <Mail className="h-3.5 w-3.5" />
            {dictionary.tabs.email}
          </button>
          <button
            type="button"
            className={cn(
              "relative z-10 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              mode === "phone" ? "text-foreground" : "text-muted-foreground",
            )}
            onClick={() => resetFlowState("phone")}
          >
            <Smartphone className="h-3.5 w-3.5" />
            {dictionary.tabs.phone}
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
            {currentStepIndex + 1}
          </div>
          <span className="flex-1 text-sm font-semibold text-foreground">{activeStepLabel}</span>
          {isOtpStep && countdownSeconds !== null ? (
            <p className={cn(
              "flex items-center gap-1 text-xs",
              isCodeExpired ? "font-medium text-destructive" : "text-muted-foreground",
            )}>
              <Clock className="h-3 w-3 shrink-0" />
              {formatCountdown(countdownSeconds)}
            </p>
          ) : (
            <div className="flex items-center gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    i === currentStepIndex ? "w-4 bg-primary" :
                    i < currentStepIndex  ? "w-1.5 bg-primary/50" :
                                            "w-1.5 bg-muted-foreground/20",
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {submitError ? (
          <Alert variant="destructive">
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}

        {submitInfo ? (
          <Alert>
            <AlertDescription>{submitInfo}</AlertDescription>
          </Alert>
        ) : null}

        {mode === "email" ? (
          <div className="space-y-4">
            {emailStep === "identifier" ? (
              <>
                <FloatingInput
                  id="email"
                  type="email"
                  label={dictionary.fields.email}
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => {
                    setSubmitError(null);
                    const result = getLoginSchema(locale).shape.email.safeParse(email);

                    if (!result.success) {
                      setSubmitError(result.error.issues[0]?.message ?? validation.emailInvalid);
                      return;
                    }

                    setEmail(result.data);
                    setEmailStep("password");
                  }}
                >
                  {dictionary.nextIdle}
                </Button>
              </>
            ) : null}

            {emailStep === "password" ? (
              <>
                <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Mail className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {dictionary.accountPrefix}
                    </p>
                    <p className="truncate text-sm font-semibold text-foreground">{email}</p>
                  </div>
                </div>

                <FloatingInput
                  id="password"
                  type="password"
                  label={dictionary.fields.password}
                  autoComplete="current-password"
                  value={emailPassword}
                  onChange={(event) => setEmailPassword(event.target.value)}
                />

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

                <div className="space-y-2">
                  <Button
                    type="button"
                    className="w-full"
                    disabled={isSubmitting}
                    onClick={startEmailChallenge}
                  >
                    {isSubmitting ? dictionary.sendCodeLoading : dictionary.sendCodeIdle}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      setSubmitError(null);
                      setEmailPassword("");
                      setEmailStep("identifier");
                    }}
                  >
                    {dictionary.backIdle}
                  </Button>
                </div>
              </>
            ) : null}

            {emailStep === "otp" ? (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="email-otp" className="text-xs font-medium text-muted-foreground">
                    {dictionary.fields.otp}
                  </label>
                  <input
                    id="email-otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                    autoFocus
                    placeholder="••••••"
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full rounded-lg border-2 border-input bg-muted/20 py-3.5 text-center font-mono text-2xl tracking-[0.4em] text-foreground outline-none transition-all placeholder:text-muted-foreground/30 focus:border-primary focus:ring-4 focus:ring-primary/15 dark:bg-input/20"
                  />
                </div>

                <div className="space-y-2">
                  {isCodeExpired ? (
                    <Button
                      type="button"
                      className="w-full"
                      disabled={isSubmitting}
                      onClick={startEmailChallenge}
                    >
                      {isSubmitting ? dictionary.resendCodeLoading : dictionary.resendCodeIdle}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="w-full"
                      disabled={isSubmitting}
                      onClick={verifyEmailChallenge}
                    >
                      {isSubmitting ? dictionary.verifyCodeLoading : dictionary.verifyCodeIdle}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      setSubmitError(null);
                      setChallengeId(null);
                      setOtpCode("");
                      setExpiresAtTimestamp(null);
                      setEmailStep("password");
                    }}
                  >
                    {dictionary.backIdle}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            {phoneStep === "identifier" ? (
              <>
                <PhoneInput
                  id="phone"
                  value={phone}
                  onChange={(value) => setPhone(value)}
                  onBlur={() => {}}
                />

                <Button
                  type="button"
                  className="w-full"
                  onClick={() => {
                    setSubmitError(null);
                    const result = getPhoneLoginSchema(locale).shape.phone.safeParse(phone);

                    if (!result.success) {
                      setSubmitError(result.error.issues[0]?.message ?? validation.phoneFormat);
                      return;
                    }

                    setPhone(result.data);
                    setPhoneStep("password");
                  }}
                >
                  {dictionary.nextIdle}
                </Button>
              </>
            ) : null}

            {phoneStep === "password" ? (
              <>
                <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Smartphone className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {dictionary.accountPrefix}
                    </p>
                    <p className="truncate text-sm font-semibold text-foreground">{phone}</p>
                  </div>
                </div>

                <FloatingInput
                  id="phone-password"
                  type="password"
                  label={dictionary.fields.password}
                  autoComplete="current-password"
                  value={phonePassword}
                  onChange={(event) => setPhonePassword(event.target.value)}
                />

                <div className="space-y-2">
                  <Button
                    type="button"
                    className="w-full"
                    disabled={isSubmitting}
                    onClick={startPhoneChallenge}
                  >
                    {isSubmitting ? dictionary.sendCodeLoading : dictionary.sendCodeIdle}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      setSubmitError(null);
                      setPhonePassword("");
                      setPhoneStep("identifier");
                    }}
                  >
                    {dictionary.backIdle}
                  </Button>
                </div>
              </>
            ) : null}

            {phoneStep === "otp" ? (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="phone-otp" className="text-xs font-medium text-muted-foreground">
                    {dictionary.fields.otp}
                  </label>
                  <input
                    id="phone-otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                    autoFocus
                    placeholder="••••••"
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full rounded-lg border-2 border-input bg-muted/20 py-3.5 text-center font-mono text-2xl tracking-[0.4em] text-foreground outline-none transition-all placeholder:text-muted-foreground/30 focus:border-primary focus:ring-4 focus:ring-primary/15 dark:bg-input/20"
                  />
                </div>

                <div className="space-y-2">
                  {isCodeExpired ? (
                    <Button
                      type="button"
                      className="w-full"
                      disabled={isSubmitting}
                      onClick={startPhoneChallenge}
                    >
                      {isSubmitting ? dictionary.resendCodeLoading : dictionary.resendCodeIdle}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="w-full"
                      disabled={isSubmitting}
                      onClick={verifyPhoneChallenge}
                    >
                      {isSubmitting ? dictionary.verifyCodeLoading : dictionary.verifyCodeIdle}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      setSubmitError(null);
                      setChallengeId(null);
                      setOtpCode("");
                      setExpiresAtTimestamp(null);
                      setPhoneStep("password");
                    }}
                  >
                    {dictionary.backIdle}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>

      {isRecoveryModalOpen ? (
        <ForgotPasswordModal
          key={recoveryModalVersion}
          open={isRecoveryModalOpen}
          onOpenChange={setIsRecoveryModalOpen}
          locale={locale}
          dictionary={passwordRecoveryDictionary}
          validation={validation}
          initialEmail={email}
        />
      ) : null}
    </AuthCard>
  );
}

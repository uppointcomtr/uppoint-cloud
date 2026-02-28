"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Check, CheckCircle, Clock, Info, Mail, Phone } from "lucide-react";

import { AppModal } from "@/components/shared/app-modal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/ui/floating-input";
import { getLoginSchema, getRegisterSchema } from "@/modules/auth/schemas/auth-schemas";
import { cn } from "@/lib/utils";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";

type RecoveryStep = "email" | "emailCode" | "smsCode" | "newPassword" | "success";

interface ForgotPasswordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
  dictionary: Dictionary["passwordRecovery"];
  validation: Dictionary["validation"];
  initialEmail?: string;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

const codeSchema = z.string().trim().regex(/^\d{6}$/);

const STEP_ORDER: Exclude<RecoveryStep, "success">[] = [
  "email",
  "emailCode",
  "smsCode",
  "newPassword",
];

function formatCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutesPart = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
  const secondsPart = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutesPart}:${secondsPart}`;
}

function resolveErrorMessage(
  errorCode: string | undefined,
  dictionary: Dictionary["passwordRecovery"],
): string {
  switch (errorCode) {
    case "VALIDATION_FAILED":
    case "INVALID_BODY":
      return dictionary.errors.validationFailed;
    case "INVALID_EMAIL_CODE":
      return dictionary.errors.invalidEmailCode;
    case "INVALID_SMS_CODE":
      return dictionary.errors.invalidSmsCode;
    case "INVALID_OR_EXPIRED_CHALLENGE":
      return dictionary.errors.expiredChallenge;
    case "MAX_ATTEMPTS_REACHED":
      return dictionary.errors.maxAttempts;
    case "PHONE_NOT_AVAILABLE":
      return dictionary.noPhone;
    case "SMS_NOT_ENABLED":
      return dictionary.smsDisabled;
    case "INVALID_OR_EXPIRED_RESET_TOKEN":
    case "RESET_TOKEN_NOT_READY":
      return dictionary.errors.resetTokenInvalid;
    case "FORGOT_PASSWORD_CHALLENGE_START_FAILED":
    case "FORGOT_PASSWORD_VERIFY_EMAIL_FAILED":
    case "FORGOT_PASSWORD_VERIFY_SMS_FAILED":
    case "FORGOT_PASSWORD_COMPLETE_FAILED":
      return dictionary.errors.unavailable;
    default:
      return dictionary.errors.generic;
  }
}

// Strip leading "1. " / "2. " numbering added in dictionary keys
function stripNumber(label: string): string {
  return label.replace(/^\d+\.\s*/, "");
}

interface StepperProps {
  step: RecoveryStep;
  labels: string[];
}

function RecoveryStepper({ step, labels }: StepperProps) {
  const currentIndex =
    step === "success"
      ? STEP_ORDER.length
      : STEP_ORDER.indexOf(step as Exclude<RecoveryStep, "success">);

  const progressPercent =
    currentIndex === 0
      ? 0
      : Math.min((currentIndex / (labels.length - 1)) * 100, 100);

  return (
    <div className="relative flex items-center justify-between pb-8">
      {/* Background connector */}
      <div className="absolute inset-x-3.5 top-3.5 h-px bg-border/60">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {labels.map((label, i) => {
        const completed = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={i} className="relative flex flex-col items-center">
            <div
              className={cn(
                "relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all duration-300",
                completed
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : active
                    ? "border-2 border-primary bg-background text-primary ring-4 ring-primary/15"
                    : "border border-border/70 bg-background text-muted-foreground",
              )}
            >
              {completed ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
            </div>
            <span
              className={cn(
                "absolute top-9 whitespace-nowrap text-[10px] font-medium leading-none",
                completed || active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ForgotPasswordModal({
  open,
  onOpenChange,
  locale,
  dictionary,
  validation,
  initialEmail,
}: ForgotPasswordModalProps) {
  const [step, setStep] = useState<RecoveryStep>("email");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [maskedPhone, setMaskedPhone] = useState<string | null>(null);

  const [emailCode, setEmailCode] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [nowTimestamp, setNowTimestamp] = useState(0);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitInfo, setSubmitInfo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (step !== "emailCode" && step !== "smsCode") return;
    const id = window.setInterval(() => setNowTimestamp(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [step]);

  const countdownSeconds = useMemo(() => {
    if (!expiresAt) return null;
    return Math.floor((expiresAt - nowTimestamp) / 1000);
  }, [expiresAt, nowTimestamp]);

  const isCodeExpired = countdownSeconds !== null && countdownSeconds <= 0;

  async function requestEmailCode() {
    setSubmitError(null);
    setSubmitInfo(null);

    const parsedEmail = getLoginSchema(locale).shape.email.safeParse(email);
    if (!parsedEmail.success) {
      setSubmitError(parsedEmail.error.issues[0]?.message ?? validation.emailInvalid);
      return;
    }

    setIsSubmitting(true);
    let response: Response;
    try {
      response = await fetch("/api/auth/forgot-password/challenge/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: parsedEmail.data, locale }),
      });
    } catch {
      setSubmitError(dictionary.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

    const payload = (await response.json()) as ApiResponse<{
      hasChallenge: boolean;
      challengeId: string | null;
      emailCodeExpiresAt: string | null;
    }>;

    if (!response.ok || !payload.success || !payload.data) {
      setSubmitError(resolveErrorMessage(payload.error, dictionary));
      setIsSubmitting(false);
      return;
    }

    if (!payload.data.hasChallenge || !payload.data.challengeId || !payload.data.emailCodeExpiresAt) {
      setSubmitInfo(dictionary.acceptedNoAccount);
      setIsSubmitting(false);
      return;
    }

    setChallengeId(payload.data.challengeId);
    setExpiresAt(new Date(payload.data.emailCodeExpiresAt).getTime());
    setNowTimestamp(Date.now());
    setEmailCode("");
    setStep("emailCode");
    setIsSubmitting(false);
  }

  async function verifyEmailCode() {
    setSubmitError(null);
    setSubmitInfo(null);

    if (!challengeId) { setSubmitError(dictionary.errors.expiredChallenge); return; }
    const parsedCode = codeSchema.safeParse(emailCode);
    if (!parsedCode.success) { setSubmitError(dictionary.errors.validationFailed); return; }
    if (isCodeExpired) { setSubmitError(dictionary.errors.expiredChallenge); return; }

    setIsSubmitting(true);
    let response: Response;
    try {
      response = await fetch("/api/auth/forgot-password/challenge/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, emailCode: parsedCode.data, locale }),
      });
    } catch {
      setSubmitError(dictionary.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

    const payload = (await response.json()) as ApiResponse<{
      smsCodeExpiresAt: string;
      maskedPhone: string;
    }>;

    if (!response.ok || !payload.success || !payload.data) {
      setSubmitError(resolveErrorMessage(payload.error, dictionary));
      setIsSubmitting(false);
      return;
    }

    setMaskedPhone(payload.data.maskedPhone);
    setExpiresAt(new Date(payload.data.smsCodeExpiresAt).getTime());
    setNowTimestamp(Date.now());
    setSmsCode("");
    setStep("smsCode");
    setIsSubmitting(false);
  }

  async function verifySmsCode() {
    setSubmitError(null);

    if (!challengeId) { setSubmitError(dictionary.errors.expiredChallenge); return; }
    const parsedCode = codeSchema.safeParse(smsCode);
    if (!parsedCode.success) { setSubmitError(dictionary.errors.validationFailed); return; }
    if (isCodeExpired) { setSubmitError(dictionary.errors.expiredChallenge); return; }

    setIsSubmitting(true);
    let response: Response;
    try {
      response = await fetch("/api/auth/forgot-password/challenge/verify-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, smsCode: parsedCode.data }),
      });
    } catch {
      setSubmitError(dictionary.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

    const payload = (await response.json()) as ApiResponse<{ resetToken: string }>;
    if (!response.ok || !payload.success || !payload.data) {
      setSubmitError(resolveErrorMessage(payload.error, dictionary));
      setIsSubmitting(false);
      return;
    }

    setResetToken(payload.data.resetToken);
    setStep("newPassword");
    setIsSubmitting(false);
  }

  async function completeReset() {
    setSubmitError(null);

    if (!challengeId || !resetToken) {
      setSubmitError(dictionary.errors.resetTokenInvalid);
      return;
    }

    const parsedPassword = getRegisterSchema(locale).shape.password.safeParse(password);
    if (!parsedPassword.success) {
      setSubmitError(parsedPassword.error.issues[0]?.message ?? dictionary.errors.validationFailed);
      return;
    }

    const confirmSchema = z
      .string()
      .trim()
      .min(1, dictionary.errors.confirmRequired)
      .refine((v) => v === password, dictionary.errors.confirmMismatch);
    const parsedConfirm = confirmSchema.safeParse(confirmPassword);
    if (!parsedConfirm.success) {
      setSubmitError(parsedConfirm.error.issues[0]?.message ?? dictionary.errors.confirmMismatch);
      return;
    }

    setIsSubmitting(true);
    let response: Response;
    try {
      response = await fetch("/api/auth/forgot-password/challenge/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, resetToken, password }),
      });
    } catch {
      setSubmitError(dictionary.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

    const payload = (await response.json()) as ApiResponse<{ reset: boolean }>;
    if (!response.ok || !payload.success) {
      setSubmitError(resolveErrorMessage(payload.error, dictionary));
      setIsSubmitting(false);
      return;
    }

    setStep("success");
    setIsSubmitting(false);
  }

  const passwordRulesMet = [
    password.length >= 12,
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;

  const passwordStrength =
    password.length === 0 ? null :
    passwordRulesMet <= 2 ? "weak" :
    passwordRulesMet <= 4 ? "medium" : "strong";

  const stepLabels = [
    stripNumber(dictionary.steps.email),
    stripNumber(dictionary.steps.emailCode),
    stripNumber(dictionary.steps.smsCode),
    stripNumber(dictionary.steps.newPassword),
  ];

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={dictionary.modalTitle}
      description={dictionary.modalDescription}
    >
      <div className="space-y-5">
        {/* Step progress indicator */}
        <RecoveryStepper step={step} labels={stepLabels} />

        {/* Alerts */}
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

        {/* ── Step: email ── */}
        {step === "email" && (
          <div className="space-y-4">
            <FloatingInput
              id="forgot-password-email"
              type="email"
              label={dictionary.fields.email}
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button
              type="button"
              className="w-full"
              disabled={isSubmitting}
              onClick={requestEmailCode}
            >
              {isSubmitting ? "..." : dictionary.buttons.sendEmailCode}
            </Button>
          </div>
        )}

        {/* ── Step: emailCode ── */}
        {step === "emailCode" && (
          <div className="space-y-4">
            {/* Email + countdown info */}
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 dark:bg-input/10">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{email}</p>
                {countdownSeconds !== null && (
                  <p
                    className={cn(
                      "mt-0.5 flex items-center gap-1 text-xs",
                      isCodeExpired ? "font-medium text-destructive" : "text-muted-foreground",
                    )}
                  >
                    <Clock className="h-3 w-3 shrink-0" />
                    {dictionary.countdownPrefix} {formatCountdown(countdownSeconds)}
                  </p>
                )}
              </div>
            </div>

            {/* Large code input */}
            <input
              id="forgot-password-email-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={emailCode}
              onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="——————"
              aria-label={dictionary.fields.emailCode}
              className="w-full rounded-lg border-2 border-input bg-muted/20 py-3.5 text-center font-mono text-2xl tracking-[0.4em] text-foreground outline-none transition-all placeholder:text-muted-foreground/30 focus:border-primary focus:ring-4 focus:ring-primary/15 dark:bg-input/20"
            />

            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" onClick={() => setStep("email")}>
                {dictionary.buttons.back}
              </Button>
              <Button
                type="button"
                disabled={isSubmitting || isCodeExpired}
                onClick={verifyEmailCode}
              >
                {dictionary.buttons.verifyEmailCode}
              </Button>
            </div>

            {isCodeExpired && (
              <Button type="button" variant="ghost" className="w-full" onClick={requestEmailCode}>
                {dictionary.buttons.restart}
              </Button>
            )}
          </div>
        )}

        {/* ── Step: smsCode ── */}
        {step === "smsCode" && (
          <div className="space-y-4">
            {/* Phone + countdown info */}
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 dark:bg-input/10">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Phone className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {dictionary.smsSentToPrefix}{" "}
                  <span className="text-primary">{maskedPhone}</span>
                </p>
                {countdownSeconds !== null && (
                  <p
                    className={cn(
                      "mt-0.5 flex items-center gap-1 text-xs",
                      isCodeExpired ? "font-medium text-destructive" : "text-muted-foreground",
                    )}
                  >
                    <Clock className="h-3 w-3 shrink-0" />
                    {dictionary.countdownPrefix} {formatCountdown(countdownSeconds)}
                  </p>
                )}
              </div>
            </div>

            {/* Large code input */}
            <input
              id="forgot-password-sms-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={smsCode}
              onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="——————"
              aria-label={dictionary.fields.smsCode}
              className="w-full rounded-lg border-2 border-input bg-muted/20 py-3.5 text-center font-mono text-2xl tracking-[0.4em] text-foreground outline-none transition-all placeholder:text-muted-foreground/30 focus:border-primary focus:ring-4 focus:ring-primary/15 dark:bg-input/20"
            />

            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" onClick={() => setStep("emailCode")}>
                {dictionary.buttons.back}
              </Button>
              <Button
                type="button"
                disabled={isSubmitting || isCodeExpired}
                onClick={verifySmsCode}
              >
                {dictionary.buttons.verifySmsCode}
              </Button>
            </div>

            {isCodeExpired && (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setStep("email");
                  setChallengeId(null);
                  setResetToken(null);
                  setMaskedPhone(null);
                  setEmailCode("");
                  setSmsCode("");
                  setExpiresAt(null);
                }}
              >
                {dictionary.buttons.restart}
              </Button>
            )}
          </div>
        )}

        {/* ── Step: newPassword ── */}
        {step === "newPassword" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <FloatingInput
                id="forgot-password-new-password"
                type="password"
                autoComplete="new-password"
                label={dictionary.fields.password}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {passwordStrength !== null && (
                <div className="flex items-center gap-2 pt-1">
                  <div className="flex flex-1 gap-1">
                    {([0, 1, 2] as const).map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          passwordStrength === "weak"   && i === 0 ? "bg-red-500"    :
                          passwordStrength === "medium" && i <= 1  ? "bg-yellow-500" :
                          passwordStrength === "strong"            ? "bg-green-500"  : "bg-muted"
                        }`}
                      />
                    ))}
                  </div>
                  <span className={`text-xs font-medium ${
                    passwordStrength === "weak"   ? "text-red-500"                :
                    passwordStrength === "medium" ? "text-yellow-500"             :
                                                    "text-green-600 dark:text-green-400"
                  }`}>
                    {passwordStrength === "weak"   ? validation.passwordStrengthWeak   :
                     passwordStrength === "medium" ? validation.passwordStrengthMedium :
                                                     validation.passwordStrengthStrong}
                  </span>
                </div>
              )}
              <p className="flex items-start gap-1 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                {validation.passwordHint}
              </p>
            </div>
            <FloatingInput
              id="forgot-password-confirm-password"
              type="password"
              autoComplete="new-password"
              label={dictionary.fields.confirmPassword}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" onClick={() => setStep("smsCode")}>
                {dictionary.buttons.back}
              </Button>
              <Button type="button" disabled={isSubmitting} onClick={completeReset}>
                {dictionary.buttons.resetPassword}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step: success ── */}
        {step === "success" && (
          <div className="flex flex-col items-center py-4 text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-8 ring-primary/5">
              <CheckCircle className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">{dictionary.successTitle}</h3>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              {dictionary.successDescription}
            </p>
            <Button
              type="button"
              className="mt-6 w-full"
              onClick={() => onOpenChange(false)}
            >
              {dictionary.buttons.close}
            </Button>
          </div>
        )}
      </div>
    </AppModal>
  );
}

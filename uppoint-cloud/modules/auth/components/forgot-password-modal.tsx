"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { AppModal } from "@/components/shared/app-modal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/ui/floating-input";
import { getLoginSchema, getRegisterSchema } from "@/modules/auth/schemas/auth-schemas";
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

function formatCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutesPart = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, "0");
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
    if (step !== "emailCode" && step !== "smsCode") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [step]);

  const countdownSeconds = useMemo(() => {
    if (!expiresAt) {
      return null;
    }

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
        body: JSON.stringify({
          email: parsedEmail.data,
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

    if (!challengeId) {
      setSubmitError(dictionary.errors.expiredChallenge);
      return;
    }

    const parsedCode = codeSchema.safeParse(emailCode);

    if (!parsedCode.success) {
      setSubmitError(dictionary.errors.validationFailed);
      return;
    }

    if (isCodeExpired) {
      setSubmitError(dictionary.errors.expiredChallenge);
      return;
    }

    setIsSubmitting(true);

    let response: Response;

    try {
      response = await fetch("/api/auth/forgot-password/challenge/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId,
          emailCode: parsedCode.data,
          locale,
        }),
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

    if (!challengeId) {
      setSubmitError(dictionary.errors.expiredChallenge);
      return;
    }

    const parsedCode = codeSchema.safeParse(smsCode);

    if (!parsedCode.success) {
      setSubmitError(dictionary.errors.validationFailed);
      return;
    }

    if (isCodeExpired) {
      setSubmitError(dictionary.errors.expiredChallenge);
      return;
    }

    setIsSubmitting(true);

    let response: Response;

    try {
      response = await fetch("/api/auth/forgot-password/challenge/verify-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId,
          smsCode: parsedCode.data,
        }),
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
      .refine((value) => value === password, dictionary.errors.confirmMismatch);

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
        body: JSON.stringify({
          challengeId,
          resetToken,
          password,
        }),
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

  const stepLabel =
    step === "email"
      ? dictionary.steps.email
      : step === "emailCode"
        ? dictionary.steps.emailCode
        : step === "smsCode"
          ? dictionary.steps.smsCode
          : step === "newPassword"
            ? dictionary.steps.newPassword
            : dictionary.successTitle;

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={dictionary.modalTitle}
      description={dictionary.modalDescription}
      className="max-w-2xl"
    >
      <div className="space-y-5">
        <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-2.5 text-sm font-medium text-muted-foreground">
          {stepLabel}
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

        {step === "email" ? (
          <div className="space-y-4">
            <FloatingInput
              id="forgot-password-email"
              type="email"
              label={dictionary.fields.email}
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />

            <Button type="button" className="w-full" disabled={isSubmitting} onClick={requestEmailCode}>
              {isSubmitting ? "..." : dictionary.buttons.sendEmailCode}
            </Button>
          </div>
        ) : null}

        {step === "emailCode" ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{email}</p>
              {countdownSeconds !== null ? (
                <p className="mt-1">{dictionary.countdownPrefix} {formatCountdown(countdownSeconds)}</p>
              ) : null}
            </div>

            <FloatingInput
              id="forgot-password-email-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              label={dictionary.fields.emailCode}
              value={emailCode}
              onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />

            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" onClick={() => setStep("email")}> 
                {dictionary.buttons.back}
              </Button>
              <Button type="button" disabled={isSubmitting || isCodeExpired} onClick={verifyEmailCode}>
                {dictionary.buttons.verifyEmailCode}
              </Button>
            </div>

            {isCodeExpired ? (
              <Button type="button" variant="ghost" className="w-full" onClick={requestEmailCode}>
                {dictionary.buttons.restart}
              </Button>
            ) : null}
          </div>
        ) : null}

        {step === "smsCode" ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
              <p>
                {dictionary.smsSentToPrefix} <span className="font-semibold text-foreground">{maskedPhone}</span>
              </p>
              {countdownSeconds !== null ? (
                <p className="mt-1">{dictionary.countdownPrefix} {formatCountdown(countdownSeconds)}</p>
              ) : null}
            </div>

            <FloatingInput
              id="forgot-password-sms-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              label={dictionary.fields.smsCode}
              value={smsCode}
              onChange={(event) => setSmsCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />

            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" onClick={() => setStep("emailCode")}>
                {dictionary.buttons.back}
              </Button>
              <Button type="button" disabled={isSubmitting || isCodeExpired} onClick={verifySmsCode}>
                {dictionary.buttons.verifySmsCode}
              </Button>
            </div>

            {isCodeExpired ? (
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
            ) : null}
          </div>
        ) : null}

        {step === "newPassword" ? (
          <div className="space-y-4">
            <FloatingInput
              id="forgot-password-new-password"
              type="password"
              autoComplete="new-password"
              label={dictionary.fields.password}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <FloatingInput
              id="forgot-password-confirm-password"
              type="password"
              autoComplete="new-password"
              label={dictionary.fields.confirmPassword}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
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
        ) : null}

        {step === "success" ? (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                <strong>{dictionary.successTitle}</strong>
                <br />
                {dictionary.successDescription}
              </AlertDescription>
            </Alert>

            <Button type="button" className="w-full" onClick={() => onOpenChange(false)}>
              {dictionary.buttons.close}
            </Button>
          </div>
        ) : null}
      </div>
    </AppModal>
  );
}

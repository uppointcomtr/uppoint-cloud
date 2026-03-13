"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle, Clock, Mail, Phone, ShieldCheck } from "lucide-react";

import { AppModal } from "@/components/shared/app-modal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/ui/floating-input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PhoneInput } from "@/modules/auth/components/phone-input";
import { VerificationCodeInput } from "@/modules/auth/components/verification-code-input";
import { type ApiResponse, fetchWithTimeout, formatCountdown } from "@/modules/auth/components/shared/request-utils";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";

type ContactChangeType = "EMAIL" | "PHONE";
type ContactChangeStep = "intro" | "emailCode" | "smsCode" | "confirm";

interface AccountContactChangeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
  labels: Dictionary["dashboard"]["account"]["contactChange"];
  changeType: ContactChangeType;
  currentEmail: string;
  currentPhone: string | null;
  onCompleted: (result: { type: ContactChangeType; updatedValue: string }) => void;
}

const CONTACT_CODE_TTL_SECONDS = 3 * 60;

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidPhone(value: string): boolean {
  return /^\+?[1-9]\d{9,14}$/.test(value.trim());
}

function mapContactChangeError(
  errorCode: string | undefined,
  labels: Dictionary["dashboard"]["account"]["contactChange"],
): string {
  switch (errorCode) {
    case "INVALID_BODY":
    case "VALIDATION_FAILED":
      return labels.errors.validationFailed;
    case "EMAIL_UNCHANGED":
    case "PHONE_UNCHANGED":
      return labels.errors.unchanged;
    case "EMAIL_CHANGE_DISABLED":
      return labels.errors.emailChangeDisabled;
    case "EMAIL_TAKEN":
      return labels.errors.emailTaken;
    case "PHONE_TAKEN":
      return labels.errors.phoneTaken;
    case "INVALID_EMAIL_CODE":
      return labels.errors.invalidEmailCode;
    case "INVALID_SMS_CODE":
      return labels.errors.invalidSmsCode;
    case "INVALID_OR_EXPIRED_CHALLENGE":
      return labels.errors.expiredChallenge;
    case "MAX_ATTEMPTS_REACHED":
      return labels.errors.maxAttempts;
    case "PHONE_NOT_AVAILABLE":
      return labels.errors.phoneUnavailable;
    case "PHONE_VERIFICATION_REQUIRED":
      return labels.errors.phoneVerificationRequired;
    case "EMAIL_VERIFICATION_REQUIRED":
      return labels.errors.emailVerificationRequired;
    case "SMS_NOT_ENABLED":
      return labels.errors.smsDisabled;
    case "CHANGE_TOKEN_NOT_READY":
    case "INVALID_OR_EXPIRED_CHANGE_TOKEN":
      return labels.errors.tokenInvalid;
    case "ACCOUNT_CONTACT_CHANGE_START_FAILED":
    case "ACCOUNT_CONTACT_CHANGE_VERIFY_EMAIL_FAILED":
    case "ACCOUNT_CONTACT_CHANGE_VERIFY_SMS_FAILED":
    case "ACCOUNT_CONTACT_CHANGE_COMPLETE_FAILED":
      return labels.errors.unavailable;
    default:
      return labels.errors.generic;
  }
}

export function AccountContactChangeModal({
  open,
  onOpenChange,
  locale,
  labels,
  changeType,
  currentEmail,
  currentPhone,
  onCompleted,
}: AccountContactChangeModalProps) {
  const [step, setStep] = useState<ContactChangeStep>("intro");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [changeToken, setChangeToken] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [maskedPhone, setMaskedPhone] = useState<string | null>(null);
  const [nextEmail, setNextEmail] = useState("");
  const [nextPhone, setNextPhone] = useState(currentPhone ?? "+90");
  const [emailCode, setEmailCode] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [expiresAtTimestamp, setExpiresAtTimestamp] = useState<number | null>(null);
  const [nowTimestamp, setNowTimestamp] = useState(0);

  const countdownSeconds = useMemo(() => {
    if (!expiresAtTimestamp) {
      return null;
    }

    return Math.floor((expiresAtTimestamp - nowTimestamp) / 1000);
  }, [expiresAtTimestamp, nowTimestamp]);

  const isCodeExpired = (step === "emailCode" || step === "smsCode")
    && countdownSeconds !== null
    && countdownSeconds <= 0;

  useEffect(() => {
    if (!open || (step !== "emailCode" && step !== "smsCode")) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [open, step]);

  function resetFlow() {
    setStep("intro");
    setIsSubmitting(false);
    setError(null);
    setInfo(null);
    setChallengeId(null);
    setChangeToken(null);
    setMaskedEmail(null);
    setMaskedPhone(null);
    setNextEmail("");
    setNextPhone(currentPhone ?? "+90");
    setEmailCode("");
    setSmsCode("");
    setExpiresAtTimestamp(null);
    setNowTimestamp(0);
  }

  function handleModalOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetFlow();
    }

    onOpenChange(nextOpen);
  }

  const introTitle = changeType === "EMAIL" ? labels.email.title : labels.phone.title;
  const modalTitle = changeType === "EMAIL" ? labels.email.modalTitle : labels.phone.modalTitle;
  const modalDescription = changeType === "EMAIL" ? labels.email.modalDescription : labels.phone.modalDescription;
  const startHint = changeType === "EMAIL" ? labels.email.introHint : labels.phone.introHint;
  const currentValueLabel = changeType === "EMAIL" ? labels.fields.currentEmail : labels.fields.currentPhone;
  const nextValueLabel = changeType === "EMAIL" ? labels.fields.nextEmail : labels.fields.nextPhone;
  const emailDestinationHint = changeType === "EMAIL"
    ? labels.email.emailDestinationHint
    : labels.phone.emailDestinationHint;
  const smsDestinationHint = changeType === "EMAIL"
    ? labels.email.smsDestinationHint
    : labels.phone.smsDestinationHint;
  const successMessage = changeType === "EMAIL" ? labels.success.emailUpdated : labels.success.phoneUpdated;

  const canStart = changeType === "EMAIL"
    ? isValidEmail(nextEmail) && nextEmail.trim().toLowerCase() !== currentEmail.trim().toLowerCase()
    : isValidPhone(nextPhone) && nextPhone.trim() !== (currentPhone ?? "").trim();
  const stepOrder: ContactChangeStep[] = ["intro", "emailCode", "smsCode", "confirm"];
  const currentStepIndex = Math.max(stepOrder.indexOf(step), 0);
  const progressPercent = (currentStepIndex / (stepOrder.length - 1)) * 100;

  async function startFlow() {
    if (isSubmitting || !canStart) {
      return;
    }

    setError(null);
    setInfo(null);
    setIsSubmitting(true);

    const payload = changeType === "EMAIL"
      ? { type: "EMAIL", nextEmail: nextEmail.trim(), locale }
      : { type: "PHONE", nextPhone: nextPhone.trim(), locale };

    let response: Response;
    try {
      response = await fetchWithTimeout("/api/auth/account/contact/change/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      setError(labels.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

    let responsePayload: ApiResponse<{
      challengeId: string;
      emailCodeExpiresAt: string;
      type: ContactChangeType;
      maskedEmail: string;
    }>;

    try {
      responsePayload = await response.json() as typeof responsePayload;
    } catch {
      setError(labels.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

    if (!response.ok || !responsePayload.success || !responsePayload.data) {
      setError(mapContactChangeError(responsePayload.error, labels));
      setIsSubmitting(false);
      return;
    }

    const expiresAtMs = new Date(responsePayload.data.emailCodeExpiresAt).getTime();

    setChallengeId(responsePayload.data.challengeId);
    setMaskedEmail(responsePayload.data.maskedEmail);
    setExpiresAtTimestamp(expiresAtMs);
    setNowTimestamp(expiresAtMs - CONTACT_CODE_TTL_SECONDS * 1000);
    setEmailCode("");
    setSmsCode("");
    setStep("emailCode");
    setInfo(null);
    setIsSubmitting(false);
  }

  async function verifyEmailStep() {
    if (isSubmitting) {
      return;
    }

    setError(null);
    setInfo(null);

    if (!challengeId || !/^\d{6}$/.test(emailCode.trim())) {
      setError(labels.errors.validationFailed);
      return;
    }

    if (isCodeExpired) {
      setError(labels.errors.expiredChallenge);
      return;
    }

    setIsSubmitting(true);

    let response: Response;
    try {
      response = await fetchWithTimeout("/api/auth/account/contact/change/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId,
          emailCode: emailCode.trim(),
          locale,
        }),
      });
    } catch {
      setError(labels.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

    let responsePayload: ApiResponse<{ smsCodeExpiresAt: string; maskedPhone: string }>;
    try {
      responsePayload = await response.json() as typeof responsePayload;
    } catch {
      setError(labels.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

    if (!response.ok || !responsePayload.success || !responsePayload.data) {
      setError(mapContactChangeError(responsePayload.error, labels));
      setIsSubmitting(false);
      return;
    }

    setMaskedPhone(responsePayload.data.maskedPhone);
    setExpiresAtTimestamp(new Date(responsePayload.data.smsCodeExpiresAt).getTime());
    setNowTimestamp(Date.now());
    setSmsCode("");
    setStep("smsCode");
    setIsSubmitting(false);
  }

  async function verifySmsStep() {
    if (isSubmitting) {
      return;
    }

    setError(null);
    setInfo(null);

    if (!challengeId || !/^\d{6}$/.test(smsCode.trim())) {
      setError(labels.errors.validationFailed);
      return;
    }

    if (isCodeExpired) {
      setError(labels.errors.expiredChallenge);
      return;
    }

    setIsSubmitting(true);

    let response: Response;
    try {
      response = await fetchWithTimeout("/api/auth/account/contact/change/verify-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId,
          smsCode: smsCode.trim(),
        }),
      });
    } catch {
      setError(labels.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

    let responsePayload: ApiResponse<{ changeToken: string }>;
    try {
      responsePayload = await response.json() as typeof responsePayload;
    } catch {
      setError(labels.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

    if (!response.ok || !responsePayload.success || !responsePayload.data) {
      setError(mapContactChangeError(responsePayload.error, labels));
      setIsSubmitting(false);
      return;
    }

    setChangeToken(responsePayload.data.changeToken);
    setStep("confirm");
    setIsSubmitting(false);
  }

  async function completeFlow() {
    if (isSubmitting || !challengeId || !changeToken) {
      return;
    }

    setError(null);
    setInfo(null);
    setIsSubmitting(true);

    let response: Response;
    try {
      response = await fetchWithTimeout("/api/auth/account/contact/change/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId,
          changeToken,
        }),
      });
    } catch {
      setError(labels.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

    let responsePayload: ApiResponse<{ type: ContactChangeType; updatedValue: string }>;
    try {
      responsePayload = await response.json() as typeof responsePayload;
    } catch {
      setError(labels.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

    if (!response.ok || !responsePayload.success || !responsePayload.data) {
      setError(mapContactChangeError(responsePayload.error, labels));
      setIsSubmitting(false);
      return;
    }

    onCompleted(responsePayload.data);
    setInfo(successMessage);
    setIsSubmitting(false);
    handleModalOpenChange(false);
  }

  return (
    <AppModal
      open={open}
      onOpenChange={handleModalOpenChange}
      title={modalTitle}
      description={modalDescription}
      className="max-w-xl"
    >
      <div className="space-y-5">
        <div className="space-y-3">
          <div className="h-1 w-full overflow-hidden rounded-full bg-border/60">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            {stepOrder.map((stepKey, index) => {
              const completed = index < currentStepIndex;
              const active = index === currentStepIndex;

              return (
                <div
                  key={stepKey}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                    completed
                      ? "bg-primary text-primary-foreground"
                      : active
                        ? "border border-primary text-primary"
                        : "border border-border/70 text-muted-foreground",
                  )}
                >
                  {index + 1}
                </div>
              );
            })}
          </div>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {info ? (
          <Alert>
            <AlertDescription>{info}</AlertDescription>
          </Alert>
        ) : null}

        {step === "intro" ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 dark:bg-input/10">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <ShieldCheck className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{introTitle}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{startHint}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4 dark:bg-input/10">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {currentValueLabel}
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {changeType === "EMAIL" ? currentEmail : (currentPhone ?? labels.noPhoneAvailable)}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {changeType === "EMAIL" ? (
                <FloatingInput
                  id="account-change-email"
                  label={labels.fields.nextEmail}
                  value={nextEmail}
                  onChange={(event) => setNextEmail(event.target.value)}
                  autoComplete="email"
                />
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="account-change-phone">{labels.fields.nextPhone}</Label>
                  <PhoneInput
                    id="account-change-phone"
                    value={nextPhone}
                    onChange={setNextPhone}
                    onBlur={() => undefined}
                  />
                </div>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" onClick={() => handleModalOpenChange(false)}>
                {labels.buttons.cancel}
              </Button>
              <Button type="button" onClick={() => void startFlow()} disabled={!canStart || isSubmitting}>
                {isSubmitting ? labels.buttons.processing : labels.buttons.start}
              </Button>
            </div>
          </div>
        ) : null}

        {step === "emailCode" ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 dark:bg-input/10">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {emailDestinationHint}
                </p>
                <p className="truncate text-sm text-muted-foreground">{maskedEmail ?? "—"}</p>
                {countdownSeconds !== null ? (
                  <p
                    className={cn(
                      "mt-0.5 flex items-center gap-1 text-xs",
                      isCodeExpired ? "font-medium text-destructive" : "text-muted-foreground",
                    )}
                  >
                    <Clock className="h-3 w-3 shrink-0" />
                    {labels.countdownPrefix} {formatCountdown(Math.max(0, countdownSeconds))}
                  </p>
                ) : null}
              </div>
            </div>

            <VerificationCodeInput
              id={`account-${changeType.toLowerCase()}-email-code`}
              value={emailCode}
              onChange={setEmailCode}
              placeholder={labels.placeholders.code}
              autoFocus
            />

            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" onClick={resetFlow}>
                {labels.buttons.restart}
              </Button>
              <Button type="button" onClick={() => void verifyEmailStep()} disabled={isSubmitting || isCodeExpired}>
                {isSubmitting ? labels.buttons.processing : labels.buttons.verifyEmail}
              </Button>
            </div>

            {isCodeExpired ? (
              <Button type="button" variant="ghost" className="w-full" onClick={resetFlow}>
                {labels.buttons.restart}
              </Button>
            ) : null}
          </div>
        ) : null}

        {step === "smsCode" ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 dark:bg-input/10">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Phone className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {smsDestinationHint}
                </p>
                <p className="truncate text-sm text-muted-foreground">{maskedPhone ?? "—"}</p>
                {countdownSeconds !== null ? (
                  <p
                    className={cn(
                      "mt-0.5 flex items-center gap-1 text-xs",
                      isCodeExpired ? "font-medium text-destructive" : "text-muted-foreground",
                    )}
                  >
                    <Clock className="h-3 w-3 shrink-0" />
                    {labels.countdownPrefix} {formatCountdown(Math.max(0, countdownSeconds))}
                  </p>
                ) : null}
              </div>
            </div>

            <VerificationCodeInput
              id={`account-${changeType.toLowerCase()}-sms-code`}
              value={smsCode}
              onChange={setSmsCode}
              placeholder={labels.placeholders.code}
              autoFocus
            />

            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" onClick={resetFlow}>
                {labels.buttons.restart}
              </Button>
              <Button type="button" onClick={() => void verifySmsStep()} disabled={isSubmitting || isCodeExpired}>
                {isSubmitting ? labels.buttons.processing : labels.buttons.verifySms}
              </Button>
            </div>

            {isCodeExpired ? (
              <Button type="button" variant="ghost" className="w-full" onClick={resetFlow}>
                {labels.buttons.restart}
              </Button>
            ) : null}
          </div>
        ) : null}

        {step === "confirm" ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 dark:bg-input/10">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{labels.confirmTitle}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{labels.confirmDescription}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4 dark:bg-input/10">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {currentValueLabel}
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {changeType === "EMAIL" ? currentEmail : (currentPhone ?? labels.noPhoneAvailable)}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4 dark:bg-input/10">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {nextValueLabel}
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {changeType === "EMAIL" ? nextEmail.trim() : nextPhone.trim()}
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" onClick={resetFlow}>
                {labels.buttons.restart}
              </Button>
              <Button type="button" onClick={() => void completeFlow()} disabled={isSubmitting}>
                {isSubmitting ? labels.buttons.processing : labels.buttons.complete}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </AppModal>
  );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";

import { Mail, Smartphone } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/ui/floating-input";
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
import { LoginModeTabs } from "./login/login-mode-tabs";
import { LoginStepIndicator } from "./login/login-step-indicator";
import { PhoneInput } from "./phone-input";
import { fetchWithTimeout, formatCountdown, type ApiResponse } from "./shared/request-utils";
import { IdentityChip } from "./shared/identity-chip";
import { VerificationCodeInput } from "./verification-code-input";

type LoginMode = "email" | "phone";
type EmailStep = "identifier" | "password" | "otp";
type PhoneStep = "identifier" | "password" | "otp";

interface LoginFormProps {
  locale: Locale;
  dictionary: Dictionary["login"];
  passwordRecoveryDictionary: Dictionary["passwordRecovery"];
  validation: Dictionary["validation"];
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
  const rawCallbackUrl = searchParams.get("callbackUrl");
  const callbackUrl = rawCallbackUrl?.startsWith("/") ? rawCallbackUrl : withLocale("/dashboard", locale);
  const prefilledEmail = searchParams.get("email") ?? "";

  const [mode, setMode] = useState<LoginMode>("email");
  const [emailStep, setEmailStep] = useState<EmailStep>("identifier");
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("identifier");

  const [email, setEmail] = useState(prefilledEmail);
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

    let payload: ApiResponse<{ hasChallenge: boolean; challengeId: string | null; codeExpiresAt: string | null }>;
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      setSubmitError(dictionary.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

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

    let payload: ApiResponse<{ loginToken: string }>;
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      setSubmitError(dictionary.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

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

    let payload: ApiResponse<{ hasChallenge: boolean; challengeId: string | null; codeExpiresAt: string | null }>;
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      setSubmitError(dictionary.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

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

    let payload: ApiResponse<{ loginToken: string }>;
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      setSubmitError(dictionary.errors.unavailable);
      setIsSubmitting(false);
      return;
    }

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
        <LoginModeTabs mode={mode} tabs={dictionary.tabs} onChangeMode={resetFlowState} />

        {/* Step indicator */}
        <LoginStepIndicator
          currentStepIndex={currentStepIndex}
          activeStepLabel={activeStepLabel}
          isOtpStep={isOtpStep}
          countdownSeconds={countdownSeconds}
          formatCountdown={formatCountdown}
        />

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
                <IdentityChip
                  label={dictionary.accountPrefix}
                  value={email}
                  icon={<Mail className="h-4 w-4 text-primary" />}
                />

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
                <VerificationCodeInput
                  id="email-otp"
                  value={otpCode}
                  onChange={setOtpCode}
                  placeholder={dictionary.fields.otp}
                  autoFocus
                />

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
                <IdentityChip
                  label={dictionary.accountPrefix}
                  value={phone}
                  icon={<Smartphone className="h-4 w-4 text-primary" />}
                />

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
                <VerificationCodeInput
                  id="phone-otp"
                  value={otpCode}
                  onChange={setOtpCode}
                  placeholder={dictionary.fields.otp}
                  autoFocus
                />

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

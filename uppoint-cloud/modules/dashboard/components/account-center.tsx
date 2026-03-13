"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PencilLine } from "lucide-react";

import { AppModal } from "@/components/shared/app-modal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FloatingInput } from "@/components/ui/floating-input";
import { ForgotPasswordModal } from "@/modules/auth/components/forgot-password-modal";
import { VerificationCodeInput } from "@/modules/auth/components/verification-code-input";
import {
  type ApiResponse,
  fetchWithTimeout,
  formatCountdown,
} from "@/modules/auth/components/shared/request-utils";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";

import { AccountContactChangeModal } from "./account-contact-change-modal";

const cardClass = "border-border/70 bg-card/90 shadow-sm";
const accountDetailsCardClass = `${cardClass} overflow-hidden gap-0 py-4`;
const accountRowPadClass = "px-4 py-4 md:px-5 md:py-4";

interface AccountCenterProps {
  locale: Locale;
  labels: Dictionary["dashboard"]["account"];
  passwordRecoveryLabels: Dictionary["passwordRecovery"];
  validationLabels: Dictionary["validation"];
  user: {
    name: string | null;
    email: string;
    phone: string | null;
    createdAt: string;
    emailVerified: string | null;
    phoneVerifiedAt: string | null;
  };
}

function resolveDisplayName(name: string | null, email: string): string {
  const trimmedName = name?.trim();
  if (trimmedName) {
    return trimmedName;
  }

  const localPart = email.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  if (!localPart) {
    return email;
  }

  return localPart.replace(/\b\w/g, (char) => char.toUpperCase());
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return (parts[0] ?? "").slice(0, 2).toUpperCase();
  }

  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

function formatMembershipDate(locale: Locale, value: string): string {
  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function mapProfileUpdateError(
  errorCode: string | undefined,
  labels: Dictionary["dashboard"]["account"],
): string {
  switch (errorCode) {
    case "VALIDATION_FAILED":
    case "INVALID_BODY":
      return labels.profile.errors.validationFailed;
    case "NAME_UNCHANGED":
      return labels.profile.errors.unchanged;
    case "INVALID_OR_EXPIRED_CHALLENGE":
      return labels.profile.errors.expiredChallenge;
    case "INVALID_EMAIL_CODE":
      return labels.profile.errors.invalidEmailCode;
    case "PROFILE_NOT_FOUND":
    case "PROFILE_UPDATE_VERIFICATION_SEND_FAILED":
    case "PROFILE_UPDATE_FAILED":
      return labels.profile.errors.unavailable;
    default:
      return labels.profile.errors.unavailable;
  }
}

function VerificationBadge({
  verified,
  labels,
}: {
  verified: boolean;
  labels: Dictionary["dashboard"]["account"]["verification"];
}) {
  return (
    <span
      className={
        verified
          ? "rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"
          : "rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300"
      }
    >
      {verified ? labels.verified : labels.pending}
    </span>
  );
}

function InfoRow({
  title,
  value,
  description,
  badge,
  actionLabel,
  onAction,
  disabled = false,
}: {
  title: string;
  value: string;
  description?: string;
  badge?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
}) {
  const hasAction = Boolean(actionLabel && onAction);

  return (
    <div
      className={
        hasAction
          ? `${accountRowPadClass} grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-6`
          : accountRowPadClass
      }
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base font-semibold tracking-tight text-foreground">
            {title}
          </p>
          {badge}
        </div>
        <p className="mt-1 break-all text-base text-muted-foreground">{value}</p>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>

      {hasAction ? (
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full rounded-xl border-border/70 bg-background/80 px-5 sm:w-auto sm:min-w-[144px] sm:justify-center"
          onClick={onAction}
          disabled={disabled}
        >
          <PencilLine className="size-4" />
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

interface NameChangeVerificationResponse {
  verificationRequired: true;
  draftToken: string;
  maskedEmail: string;
  emailCodeExpiresAt: string;
}

interface NameChangeCompletedResponse {
  verificationRequired: false;
  name: string;
  email: string;
}

type ProfileUpdateResponseData = NameChangeVerificationResponse | NameChangeCompletedResponse;

export function AccountCenter({
  locale,
  labels,
  passwordRecoveryLabels,
  validationLabels,
  user,
}: AccountCenterProps) {
  const router = useRouter();
  const [currentName, setCurrentName] = useState(user.name ?? "");
  const [draftName, setDraftName] = useState(user.name ?? "");
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameInfo, setNameInfo] = useState<string | null>(null);
  const [nameChangeDraftToken, setNameChangeDraftToken] = useState<string | null>(null);
  const [nameVerificationCode, setNameVerificationCode] = useState("");
  const [nameVerificationMaskedEmail, setNameVerificationMaskedEmail] = useState<string | null>(null);
  const [nameCodeExpiresAtTimestamp, setNameCodeExpiresAtTimestamp] = useState<number | null>(null);
  const [nameCodeNowTimestamp, setNameCodeNowTimestamp] = useState(0);
  const [emailValue, setEmailValue] = useState(user.email);
  const [phoneValue, setPhoneValue] = useState(user.phone);
  const [emailVerifiedAt, setEmailVerifiedAt] = useState(user.emailVerified);
  const [phoneVerifiedAt, setPhoneVerifiedAt] = useState(user.phoneVerifiedAt);
  const [activeModal, setActiveModal] = useState<"PHONE" | null>(null);
  const [identityInfo, setIdentityInfo] = useState<string | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  const displayName = useMemo(
    () => resolveDisplayName(currentName, emailValue),
    [currentName, emailValue],
  );
  const initials = useMemo(() => getInitials(displayName), [displayName]);
  const membershipDate = useMemo(
    () => formatMembershipDate(locale, user.createdAt),
    [locale, user.createdAt],
  );
  const normalizedDraftName = draftName.trim().replace(/\s+/g, " ");
  const canSaveName =
    normalizedDraftName.length >= 3 &&
    normalizedDraftName !== (currentName.trim() || "");
  const isNameVerificationStep = Boolean(nameChangeDraftToken);
  const nameCountdownSeconds = useMemo(() => {
    if (!nameCodeExpiresAtTimestamp) {
      return null;
    }

    return Math.floor((nameCodeExpiresAtTimestamp - nameCodeNowTimestamp) / 1000);
  }, [nameCodeExpiresAtTimestamp, nameCodeNowTimestamp]);
  const isNameCodeExpired = nameCountdownSeconds !== null && nameCountdownSeconds <= 0;
  const canVerifyName =
    isNameVerificationStep &&
    /^\d{6}$/.test(nameVerificationCode.trim()) &&
    !isNameCodeExpired;
  const canChangePhone = Boolean(emailVerifiedAt);

  useEffect(() => {
    if (!isNameVerificationStep || !isNameModalOpen) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNameCodeNowTimestamp(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isNameModalOpen, isNameVerificationStep]);

  function resetNameVerification() {
    setNameChangeDraftToken(null);
    setNameVerificationCode("");
    setNameVerificationMaskedEmail(null);
    setNameCodeExpiresAtTimestamp(null);
    setNameCodeNowTimestamp(0);
  }

  async function handleStartNameChangeChallenge() {
    if (isSavingName || !canSaveName) {
      return;
    }

    setNameError(null);
    setNameInfo(null);
    setIdentityInfo(null);
    setIsSavingName(true);

    let response: Response;
    try {
      response = await fetchWithTimeout("/api/auth/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: normalizedDraftName,
          locale,
          verificationStep: "start",
        }),
      });
    } catch {
      setNameError(labels.profile.errors.unavailable);
      setIsSavingName(false);
      return;
    }

    let payload: ApiResponse<ProfileUpdateResponseData>;
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      setNameError(labels.profile.errors.unavailable);
      setIsSavingName(false);
      return;
    }

    if (!response.ok || !payload.success || !payload.data) {
      setNameError(mapProfileUpdateError(payload.error, labels));
      setIsSavingName(false);
      return;
    }

    if (!payload.data.verificationRequired) {
      setCurrentName(payload.data.name);
      setDraftName(payload.data.name);
      setNameInfo(labels.profile.feedback.saved);
      setIsNameModalOpen(false);
      resetNameVerification();
      setIsSavingName(false);
      router.refresh();
      return;
    }

    const challengeExpiresAtMs = new Date(payload.data.emailCodeExpiresAt).getTime();
    setNameChangeDraftToken(payload.data.draftToken);
    setNameVerificationMaskedEmail(payload.data.maskedEmail);
    setNameVerificationCode("");
    setNameCodeExpiresAtTimestamp(challengeExpiresAtMs);
    setNameCodeNowTimestamp(Date.now());
    setNameInfo(labels.profile.feedback.challengeSent);
    setIsSavingName(false);
  }

  async function handleVerifyAndSaveName() {
    if (isSavingName || !nameChangeDraftToken || !canVerifyName) {
      return;
    }

    setNameError(null);
    setNameInfo(null);
    setIdentityInfo(null);
    setIsSavingName(true);

    let response: Response;
    try {
      response = await fetchWithTimeout("/api/auth/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: normalizedDraftName,
          locale,
          verificationStep: "verify",
          draftToken: nameChangeDraftToken,
          emailCode: nameVerificationCode.trim(),
        }),
      });
    } catch {
      setNameError(labels.profile.errors.unavailable);
      setIsSavingName(false);
      return;
    }

    let payload: ApiResponse<ProfileUpdateResponseData>;
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      setNameError(labels.profile.errors.unavailable);
      setIsSavingName(false);
      return;
    }

    if (!response.ok || !payload.success || !payload.data || payload.data.verificationRequired) {
      setNameError(mapProfileUpdateError(payload.error, labels));
      setIsSavingName(false);
      return;
    }

    setCurrentName(payload.data.name);
    setDraftName(payload.data.name);
    setNameInfo(labels.profile.feedback.saved);
    setIsNameModalOpen(false);
    resetNameVerification();
    setIsSavingName(false);
    router.refresh();
  }

  function resetNameChangeModalState() {
    setDraftName(currentName);
    setNameError(null);
    setNameInfo(null);
    resetNameVerification();
  }

  function handleNameModalOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetNameChangeModalState();
    }

    setIsNameModalOpen(nextOpen);
  }

  function handleContactChangeCompleted(result: {
    type: "EMAIL" | "PHONE";
    updatedValue: string;
  }) {
    if (result.type === "EMAIL") {
      setEmailValue(result.updatedValue);
      setEmailVerifiedAt(new Date().toISOString());
      setIdentityInfo(labels.contactChange.success.emailUpdated);
    } else {
      setPhoneValue(result.updatedValue);
      setPhoneVerifiedAt(new Date().toISOString());
      setIdentityInfo(labels.contactChange.success.phoneUpdated);
    }

    router.refresh();
  }

  return (
    <>
      <Card className={cardClass}>
        <CardContent className="corp-profile-summary-pad">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span className="inline-flex size-14 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary shadow-sm">
              {initials}
            </span>

            <div className="min-w-0 space-y-1">
              <p className="truncate text-lg leading-6 font-semibold tracking-tight text-foreground">
                {displayName}
              </p>
              <p className="truncate text-sm leading-6 text-muted-foreground">
                {emailValue}
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                <span className="font-medium text-foreground/80">
                  {labels.layout.membershipDateLabel}
                </span>{" "}
                {membershipDate}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={accountDetailsCardClass}>
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle className="corp-section-title">
            {labels.layout.personalInfoHeading}
          </CardTitle>
          <CardDescription className="corp-body-muted">
            {labels.layout.personalInfoDescription}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 px-4 pb-2 pt-3 md:px-5 md:pb-3 md:pt-4">
          {identityInfo ? (
            <Alert>
              <AlertDescription>{identityInfo}</AlertDescription>
            </Alert>
          ) : null}

          <section>
            <div className="overflow-hidden rounded-3xl border border-border/60 bg-background/65">
              <div className="border-b border-border/60">
                <InfoRow
                  title={labels.profile.fields.name}
                  value={displayName}
                  actionLabel={labels.layout.editAction}
                  onAction={() => handleNameModalOpenChange(true)}
                />
              </div>

              <div className="border-b border-border/60">
                <InfoRow
                  title={labels.identity.phoneTitle}
                  value={phoneValue ?? labels.identity.noPhone}
                  description={
                    canChangePhone
                      ? labels.identity.phoneHint
                      : labels.identity.phoneDisabledHint
                  }
                  badge={
                    <VerificationBadge
                      verified={Boolean(phoneVerifiedAt)}
                      labels={labels.verification}
                    />
                  }
                  actionLabel={labels.layout.editAction}
                  onAction={() => setActiveModal("PHONE")}
                  disabled={!canChangePhone}
                />
              </div>

              <InfoRow
                title={labels.layout.passwordHeading}
                value={labels.layout.maskedPassword}
                description={labels.access.passwordDescription}
                actionLabel={labels.layout.editAction}
                onAction={() => setIsPasswordModalOpen(true)}
              />
            </div>
          </section>
        </CardContent>
      </Card>

      <AppModal
        open={isNameModalOpen}
        onOpenChange={handleNameModalOpenChange}
        title={labels.profile.fields.name}
        description={labels.profile.nameHint}
        className="max-w-xl"
      >
        <div className="space-y-4">
          {nameError ? (
            <Alert variant="destructive">
              <AlertDescription>{nameError}</AlertDescription>
            </Alert>
          ) : null}

          {nameInfo ? (
            <Alert>
              <AlertDescription>{nameInfo}</AlertDescription>
            </Alert>
          ) : null}

          <FloatingInput
            id="account-full-name"
            label={labels.profile.fields.name}
            value={draftName}
            onChange={(event) => {
              setDraftName(event.target.value);
              if (isNameVerificationStep) {
                setNameInfo(null);
                resetNameVerification();
              }
            }}
            autoComplete="name"
          />

          {isNameVerificationStep ? (
            <div className="space-y-4 rounded-2xl border border-border/60 bg-background/70 p-4">
              <p className="text-sm font-medium text-foreground">
                {labels.profile.verification.codeSentTo}
              </p>
              <p className="text-sm text-muted-foreground">
                {nameVerificationMaskedEmail ?? "—"}
              </p>
              {nameCountdownSeconds !== null && nameCountdownSeconds > 0 ? (
                <p className="text-xs font-medium text-primary">
                  {labels.profile.verification.countdownPrefix} {formatCountdown(nameCountdownSeconds)}
                </p>
              ) : null}
              <VerificationCodeInput
                id="account-profile-name-email-code"
                value={nameVerificationCode}
                onChange={setNameVerificationCode}
                placeholder={labels.profile.verification.codePlaceholder}
                autoFocus
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl sm:min-w-[144px]"
              onClick={() => handleNameModalOpenChange(false)}
            >
              {labels.layout.cancelEdit}
            </Button>
            <Button
              type="button"
              className="h-11 rounded-xl sm:min-w-[144px]"
              onClick={() => {
                if (isNameVerificationStep) {
                  void handleVerifyAndSaveName();
                  return;
                }

                void handleStartNameChangeChallenge();
              }}
              disabled={isNameVerificationStep ? !canVerifyName || isSavingName : !canSaveName || isSavingName}
            >
              {isSavingName ? (
                isNameVerificationStep
                  ? labels.profile.buttons.verifying
                  : labels.profile.buttons.sending
              ) : (
                isNameVerificationStep
                  ? labels.profile.buttons.verify
                  : labels.profile.buttons.save
              )}
            </Button>
          </div>
        </div>
      </AppModal>

      <AccountContactChangeModal
        open={activeModal === "PHONE"}
        onOpenChange={(open) => setActiveModal(open ? "PHONE" : null)}
        locale={locale}
        labels={labels.contactChange}
        changeType="PHONE"
        currentEmail={emailValue}
        currentPhone={phoneValue}
        onCompleted={handleContactChangeCompleted}
      />

      <ForgotPasswordModal
        key={emailValue}
        open={isPasswordModalOpen}
        onOpenChange={setIsPasswordModalOpen}
        locale={locale}
        dictionary={passwordRecoveryLabels}
        validation={validationLabels}
        initialEmail={emailValue}
      />
    </>
  );
}

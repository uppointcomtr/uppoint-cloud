"use client";

import { type ReactNode, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PencilLine, UserRound } from "lucide-react";

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
import {
  type ApiResponse,
  fetchWithTimeout,
} from "@/modules/auth/components/shared/request-utils";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";

import { AccountContactChangeModal } from "./account-contact-change-modal";

const cardClass = "border-border/70 bg-card/90 shadow-sm";

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
    case "PROFILE_NOT_FOUND":
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
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="corp-row-pad grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-6">
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
    </div>
  );
}

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
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameInfo, setNameInfo] = useState<string | null>(null);
  const [emailValue, setEmailValue] = useState(user.email);
  const [phoneValue, setPhoneValue] = useState(user.phone);
  const [emailVerifiedAt, setEmailVerifiedAt] = useState(user.emailVerified);
  const [phoneVerifiedAt, setPhoneVerifiedAt] = useState(user.phoneVerifiedAt);
  const [activeModal, setActiveModal] = useState<"EMAIL" | "PHONE" | null>(null);
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
  const canChangeEmail = Boolean(phoneValue && phoneVerifiedAt);
  const canChangePhone = Boolean(emailVerifiedAt);

  async function handleSaveName() {
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
        }),
      });
    } catch {
      setNameError(labels.profile.errors.unavailable);
      setIsSavingName(false);
      return;
    }

    let payload: ApiResponse<{ name: string; email: string }>;
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

    setCurrentName(payload.data.name);
    setDraftName(payload.data.name);
    setNameInfo(labels.profile.feedback.saved);
    setIsEditingName(false);
    setIsSavingName(false);
    router.refresh();
  }

  function cancelNameEdit() {
    setDraftName(currentName);
    setIsEditingName(false);
    setNameError(null);
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

      <Card className={`${cardClass} overflow-hidden`}>
        <CardHeader className="border-b border-border/60 pb-6">
          <CardTitle className="corp-section-title">
            {labels.layout.personalInfoHeading}
          </CardTitle>
          <CardDescription className="corp-body-muted">
            {labels.layout.personalInfoDescription}
          </CardDescription>
        </CardHeader>

        <CardContent className="corp-surface-pad space-y-6">
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

          {identityInfo ? (
            <Alert>
              <AlertDescription>{identityInfo}</AlertDescription>
            </Alert>
          ) : null}

          <section>
            <div className="overflow-hidden rounded-3xl border border-border/60 bg-background/65">
              <div className="border-b border-border/60">
                {isEditingName ? (
                  <div className="corp-row-pad space-y-5">
                    <div className="flex items-center gap-2">
                      <UserRound className="size-4 text-muted-foreground" />
                      <p className="text-base font-semibold tracking-tight text-foreground">
                        {labels.profile.fields.name}
                      </p>
                    </div>

                    <FloatingInput
                      id="account-full-name"
                      label={labels.profile.fields.name}
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      autoComplete="name"
                    />

                    <p className="text-sm leading-6 text-muted-foreground">
                      {labels.profile.nameHint}
                    </p>

                    <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 rounded-xl sm:min-w-[144px]"
                        onClick={cancelNameEdit}
                      >
                        {labels.layout.cancelEdit}
                      </Button>
                      <Button
                        type="button"
                        className="h-11 rounded-xl sm:min-w-[144px]"
                        onClick={() => void handleSaveName()}
                        disabled={!canSaveName || isSavingName}
                      >
                        {isSavingName
                          ? labels.profile.buttons.saving
                          : labels.profile.buttons.save}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <InfoRow
                    title={labels.profile.fields.name}
                    value={displayName}
                    actionLabel={labels.layout.editAction}
                    onAction={() => {
                      setDraftName(currentName);
                      setNameInfo(null);
                      setNameError(null);
                      setIsEditingName(true);
                    }}
                  />
                )}
              </div>

              <div className="border-b border-border/60">
                <InfoRow
                  title={labels.identity.emailTitle}
                  value={emailValue}
                  description={
                    canChangeEmail
                      ? labels.identity.emailHint
                      : labels.identity.emailDisabledHint
                  }
                  badge={
                    <VerificationBadge
                      verified={Boolean(emailVerifiedAt)}
                      labels={labels.verification}
                    />
                  }
                  actionLabel={labels.layout.editAction}
                  onAction={() => setActiveModal("EMAIL")}
                  disabled={!canChangeEmail}
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

      <AccountContactChangeModal
        open={activeModal === "EMAIL"}
        onOpenChange={(open) => setActiveModal(open ? "EMAIL" : null)}
        locale={locale}
        labels={labels.contactChange}
        changeType="EMAIL"
        currentEmail={emailValue}
        currentPhone={phoneValue}
        onCompleted={handleContactChangeCompleted}
      />

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

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  CheckCircle2,
  KeyRound,
  Mail,
  PencilLine,
  Phone,
  UserRound,
} from "lucide-react";

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

function SummaryMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border/60 bg-background/70 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function GuardrailItem({ label }: { label: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/65 px-4 py-3">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <CheckCircle2 className="size-3.5" />
      </span>
      <p className="text-sm leading-6 text-foreground">{label}</p>
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
  const [nameValue, setNameValue] = useState(user.name ?? "");
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
    () => resolveDisplayName(nameValue, emailValue),
    [nameValue, emailValue],
  );
  const normalizedName = nameValue.trim().replace(/\s+/g, " ");
  const canSaveName =
    normalizedName.length >= 3 && normalizedName !== (user.name?.trim() ?? "");
  const canChangeEmail = Boolean(phoneValue && phoneVerifiedAt);
  const canChangePhone = Boolean(emailVerifiedAt);
  const verifiedChannelsCount =
    Number(Boolean(emailVerifiedAt)) + Number(Boolean(phoneVerifiedAt));

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
          name: normalizedName,
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

    setNameValue(payload.data.name);
    setNameInfo(labels.profile.feedback.saved);
    setIsSavingName(false);
    router.refresh();
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
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_288px]">
        {/* ── Main column ── */}
        <div className="space-y-6">
          {/* Profile Card */}
          <Card className={`${cardClass} overflow-hidden`}>
            <CardHeader className="pb-0">
              <CardTitle className="corp-section-title">
                {labels.profile.title}
              </CardTitle>
              <CardDescription>{labels.profile.description}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-5 pt-6">
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

              {/* Identity header */}
              <div className="flex items-center gap-4 rounded-2xl border border-primary/10 bg-[linear-gradient(135deg,theme(colors.primary/.07),transparent_60%)] px-5 py-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
                  <UserRound className="size-6" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-foreground">
                    {displayName}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {emailValue}
                  </p>
                </div>
              </div>

              {/* Metrics row */}
              <div className="grid grid-cols-3 gap-3">
                <SummaryMetric
                  label={labels.overview.verifiedChannels}
                  value={`${verifiedChannelsCount}/2`}
                />
                <SummaryMetric
                  label={labels.overview.protectedChanges}
                  value={labels.overview.protectedChangesValue}
                />
                <SummaryMetric
                  label={labels.overview.resetFlow}
                  value={labels.overview.resetFlowValue}
                />
              </div>

              {/* Name input + save */}
              <div className="space-y-3">
                <FloatingInput
                  id="account-full-name"
                  label={labels.profile.fields.name}
                  value={nameValue}
                  onChange={(event) => setNameValue(event.target.value)}
                  autoComplete="name"
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  {labels.profile.nameHint}
                </p>
                <Button
                  type="button"
                  onClick={() => void handleSaveName()}
                  disabled={!canSaveName || isSavingName}
                  className="w-full sm:w-auto"
                >
                  {isSavingName
                    ? labels.profile.buttons.saving
                    : labels.profile.buttons.save}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Identity Card */}
          <Card className={cardClass}>
            <CardHeader>
              <CardTitle className="corp-section-title">
                {labels.identity.title}
              </CardTitle>
              <CardDescription>{labels.identity.description}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {identityInfo ? (
                <Alert>
                  <AlertDescription>{identityInfo}</AlertDescription>
                </Alert>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Email tile */}
                <div className="flex flex-col rounded-2xl border border-border/60 bg-background/65 p-5">
                  <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Mail className="size-5" />
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {labels.identity.emailTitle}
                    </p>
                    <VerificationBadge
                      verified={Boolean(emailVerifiedAt)}
                      labels={labels.verification}
                    />
                  </div>
                  <p className="mt-1 break-all text-sm text-muted-foreground">
                    {emailValue}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {canChangeEmail
                      ? labels.identity.emailHint
                      : labels.identity.emailDisabledHint}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 w-full justify-between rounded-xl"
                    disabled={!canChangeEmail}
                    onClick={() => setActiveModal("EMAIL")}
                  >
                    <span className="inline-flex items-center gap-2">
                      <PencilLine className="size-4" />
                      {labels.identity.changeEmail}
                    </span>
                    <ArrowUpRight className="size-4" />
                  </Button>
                </div>

                {/* Phone tile */}
                <div className="flex flex-col rounded-2xl border border-border/60 bg-background/65 p-5">
                  <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Phone className="size-5" />
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {labels.identity.phoneTitle}
                    </p>
                    <VerificationBadge
                      verified={Boolean(phoneVerifiedAt)}
                      labels={labels.verification}
                    />
                  </div>
                  <p className="mt-1 break-all text-sm text-muted-foreground">
                    {phoneValue ?? labels.identity.noPhone}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {canChangePhone
                      ? labels.identity.phoneHint
                      : labels.identity.phoneDisabledHint}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 w-full justify-between rounded-xl"
                    disabled={!canChangePhone}
                    onClick={() => setActiveModal("PHONE")}
                  >
                    <span className="inline-flex items-center gap-2">
                      <PencilLine className="size-4" />
                      {labels.identity.changePhone}
                    </span>
                    <ArrowUpRight className="size-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Sidebar column ── */}
        <div className="space-y-6">
          {/* Access Card */}
          <Card className={cardClass}>
            <CardHeader>
              <CardTitle className="corp-section-title">
                {labels.access.title}
              </CardTitle>
              <CardDescription>{labels.access.description}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="rounded-2xl border border-border/60 bg-background/65 p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <KeyRound className="size-4" />
                  </span>
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-foreground">
                      {labels.access.passwordTitle}
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {labels.access.passwordDescription}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  className="mt-4 w-full justify-between rounded-xl"
                  onClick={() => setIsPasswordModalOpen(true)}
                >
                  <span className="inline-flex items-center gap-2">
                    <KeyRound className="size-4" />
                    {labels.access.openPasswordFlow}
                  </span>
                  <ArrowUpRight className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Guardrails Card */}
          <Card className={cardClass}>
            <CardHeader>
              <CardTitle className="corp-section-title">
                {labels.guardrails.title}
              </CardTitle>
              <CardDescription>{labels.guardrails.description}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-2.5">
              <GuardrailItem label={labels.guardrails.emailRequirement} />
              <GuardrailItem label={labels.guardrails.phoneRequirement} />
              <GuardrailItem label={labels.guardrails.passwordRequirement} />
            </CardContent>
          </Card>
        </div>
      </div>

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

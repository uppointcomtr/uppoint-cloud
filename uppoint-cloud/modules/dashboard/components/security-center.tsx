"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AppModal } from "@/components/shared/app-modal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { VerificationCodeInput } from "@/modules/auth/components/verification-code-input";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";
import { SecurityActiveSessionsPanel } from "./security-active-sessions-panel";
import { SecurityEventsTable } from "./security-events-table";

interface SecurityEventRow {
  id: string;
  action: string;
  result: string | null;
  reason: string | null;
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAtIso: string;
}

interface CurrentSessionSnapshot {
  ip: string | null;
  userAgent: string | null;
  observedAtIso: string;
  loginAtIso: string | null;
}

interface SecurityCenterProps {
  locale: Locale;
  labels: Dictionary["dashboard"]["security"];
  activeSessions: number;
  auditFailures24h: number;
  events: SecurityEventRow[];
  currentSession: CurrentSessionSnapshot;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

type DeleteStep = "intro" | "emailCode" | "smsCode" | "confirm";

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

function resolveDeviceName(userAgent: string | null, fallback: string): string {
  if (!userAgent) {
    return fallback;
  }

  const ua = userAgent.toLowerCase();

  const browser = ua.includes("edg/")
    ? "Edge"
    : ua.includes("chrome/")
      ? "Chrome"
      : ua.includes("firefox/")
        ? "Firefox"
        : ua.includes("safari/")
          ? "Safari"
          : "Browser";

  const os = ua.includes("windows")
    ? "Windows"
    : ua.includes("android")
      ? "Android"
      : ua.includes("iphone") || ua.includes("ipad")
        ? "iOS"
        : ua.includes("mac os")
          ? "macOS"
          : ua.includes("linux")
            ? "Linux"
            : "OS";

  return `${browser} / ${os}`;
}

function resolveActionLabel(
  action: string,
  labels: Dictionary["dashboard"]["security"]["actionLabels"],
): string {
  const translated = labels[action as keyof typeof labels];
  if (translated) {
    return translated;
  }

  return action.replace(/_/g, " ");
}

function resolveAccountDeleteErrorMessage(
  errorCode: string | undefined,
  labels: Dictionary["dashboard"]["security"],
): string {
  switch (errorCode) {
    case "VALIDATION_FAILED":
    case "INVALID_BODY":
      return labels.deleteFlow.errors.validationFailed;
    case "INVALID_EMAIL_CODE":
      return labels.deleteFlow.errors.invalidEmailCode;
    case "INVALID_SMS_CODE":
      return labels.deleteFlow.errors.invalidSmsCode;
    case "INVALID_OR_EXPIRED_CHALLENGE":
      return labels.deleteFlow.errors.expiredChallenge;
    case "MAX_ATTEMPTS_REACHED":
      return labels.deleteFlow.errors.maxAttempts;
    case "PHONE_NOT_AVAILABLE":
      return labels.deleteFlow.noPhone;
    case "SMS_NOT_ENABLED":
      return labels.deleteFlow.smsDisabled;
    case "DELETE_TOKEN_NOT_READY":
    case "INVALID_OR_EXPIRED_DELETE_TOKEN":
      return labels.deleteFlow.errors.tokenInvalid;
    case "ACCOUNT_DELETE_CHALLENGE_START_FAILED":
    case "ACCOUNT_DELETE_VERIFY_EMAIL_FAILED":
    case "ACCOUNT_DELETE_VERIFY_SMS_FAILED":
    case "ACCOUNT_DELETE_COMPLETE_FAILED":
      return labels.deleteFlow.errors.unavailable;
    default:
      return labels.deleteFlow.errors.generic;
  }
}

export function SecurityCenter({
  locale,
  labels,
  activeSessions,
  auditFailures24h,
  events,
  currentSession,
}: SecurityCenterProps) {
  const router = useRouter();

  const [isEndSessionsModalOpen, setIsEndSessionsModalOpen] = useState(false);
  const [isEndingSessions, setIsEndingSessions] = useState(false);
  const [endSessionsError, setEndSessionsError] = useState<string | null>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<DeleteStep>("intro");
  const [deleteChallengeId, setDeleteChallengeId] = useState<string | null>(null);
  const [deleteToken, setDeleteToken] = useState<string | null>(null);
  const [maskedPhone, setMaskedPhone] = useState<string | null>(null);
  const [deleteEmailCode, setDeleteEmailCode] = useState("");
  const [deleteSmsCode, setDeleteSmsCode] = useState("");
  const [deleteExpiresAt, setDeleteExpiresAt] = useState<number | null>(null);
  const [deleteNowTimestamp, setDeleteNowTimestamp] = useState(0);
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteInfo, setDeleteInfo] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const normalizedEvents = useMemo(
    () =>
      events.map((event) => ({
        ...event,
        device: resolveDeviceName(event.userAgent, labels.unknownDevice),
        actionLabel: resolveActionLabel(event.action, labels.actionLabels),
      })),
    [events, labels.actionLabels, labels.unknownDevice],
  );

  const deleteCountdownSeconds = useMemo(() => {
    if (!deleteExpiresAt) {
      return null;
    }

    return Math.floor((deleteExpiresAt - deleteNowTimestamp) / 1000);
  }, [deleteExpiresAt, deleteNowTimestamp]);

  const isDeleteCodeExpired =
    (deleteStep === "emailCode" || deleteStep === "smsCode") &&
    deleteCountdownSeconds !== null &&
    deleteCountdownSeconds <= 0;

  useEffect(() => {
    if (!isDeleteModalOpen || (deleteStep !== "emailCode" && deleteStep !== "smsCode")) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setDeleteNowTimestamp(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isDeleteModalOpen, deleteStep]);

  function resetDeleteFlow() {
    setDeleteStep("intro");
    setDeleteChallengeId(null);
    setDeleteToken(null);
    setMaskedPhone(null);
    setDeleteEmailCode("");
    setDeleteSmsCode("");
    setDeleteExpiresAt(null);
    setDeleteNowTimestamp(0);
    setDeleteError(null);
    setDeleteInfo(null);
    setIsDeleteSubmitting(false);
  }

  function handleDeleteModalChange(open: boolean) {
    setIsDeleteModalOpen(open);
    if (!open) {
      resetDeleteFlow();
    }
  }

  async function handleEndAllSessionsConfirm() {
    if (isEndingSessions) {
      return;
    }

    setError(null);
    setInfo(null);
    setEndSessionsError(null);
    setIsEndingSessions(true);

    let response: Response;
    try {
      response = await fetchWithTimeout("/api/auth/logout/all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      setEndSessionsError(labels.feedback.actionFailed);
      setIsEndingSessions(false);
      return;
    }

    if (!response.ok) {
      setEndSessionsError(labels.feedback.actionFailed);
      setIsEndingSessions(false);
      return;
    }

    setInfo(labels.feedback.sessionsEnded);
    setIsEndSessionsModalOpen(false);
    router.push(withLocale("/login", locale));
    router.refresh();
  }

  async function requestDeleteEmailCode() {
    if (isDeleteSubmitting) {
      return;
    }

    setDeleteError(null);
    setDeleteInfo(null);
    setIsDeleteSubmitting(true);

    let response: Response;
    try {
      response = await fetchWithTimeout("/api/auth/account/delete/challenge/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
    } catch {
      setDeleteError(labels.deleteFlow.errors.unavailable);
      setIsDeleteSubmitting(false);
      return;
    }

    let payload: ApiResponse<{ challengeId: string; emailCodeExpiresAt: string }>;
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      setDeleteError(labels.deleteFlow.errors.unavailable);
      setIsDeleteSubmitting(false);
      return;
    }

    if (!response.ok || !payload.success || !payload.data) {
      setDeleteError(resolveAccountDeleteErrorMessage(payload.error, labels));
      setIsDeleteSubmitting(false);
      return;
    }

    setDeleteChallengeId(payload.data.challengeId);
    setDeleteExpiresAt(new Date(payload.data.emailCodeExpiresAt).getTime());
    setDeleteNowTimestamp(Date.now());
    setDeleteEmailCode("");
    setDeleteStep("emailCode");
    setIsDeleteSubmitting(false);
  }

  async function verifyDeleteEmailCode() {
    if (isDeleteSubmitting) {
      return;
    }

    setDeleteError(null);
    setDeleteInfo(null);

    if (!deleteChallengeId) {
      setDeleteError(labels.deleteFlow.errors.expiredChallenge);
      return;
    }

    if (!/^\d{6}$/.test(deleteEmailCode.trim())) {
      setDeleteError(labels.deleteFlow.errors.validationFailed);
      return;
    }

    if (isDeleteCodeExpired) {
      setDeleteError(labels.deleteFlow.errors.expiredChallenge);
      return;
    }

    setIsDeleteSubmitting(true);

    let response: Response;
    try {
      response = await fetchWithTimeout("/api/auth/account/delete/challenge/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: deleteChallengeId,
          emailCode: deleteEmailCode.trim(),
          locale,
        }),
      });
    } catch {
      setDeleteError(labels.deleteFlow.errors.unavailable);
      setIsDeleteSubmitting(false);
      return;
    }

    let payload: ApiResponse<{ smsCodeExpiresAt: string; maskedPhone: string }>;
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      setDeleteError(labels.deleteFlow.errors.unavailable);
      setIsDeleteSubmitting(false);
      return;
    }

    if (!response.ok || !payload.success || !payload.data) {
      setDeleteError(resolveAccountDeleteErrorMessage(payload.error, labels));
      setIsDeleteSubmitting(false);
      return;
    }

    setMaskedPhone(payload.data.maskedPhone);
    setDeleteExpiresAt(new Date(payload.data.smsCodeExpiresAt).getTime());
    setDeleteNowTimestamp(Date.now());
    setDeleteSmsCode("");
    setDeleteStep("smsCode");
    setIsDeleteSubmitting(false);
  }

  async function verifyDeleteSmsCode() {
    if (isDeleteSubmitting) {
      return;
    }

    setDeleteError(null);
    setDeleteInfo(null);

    if (!deleteChallengeId) {
      setDeleteError(labels.deleteFlow.errors.expiredChallenge);
      return;
    }

    if (!/^\d{6}$/.test(deleteSmsCode.trim())) {
      setDeleteError(labels.deleteFlow.errors.validationFailed);
      return;
    }

    if (isDeleteCodeExpired) {
      setDeleteError(labels.deleteFlow.errors.expiredChallenge);
      return;
    }

    setIsDeleteSubmitting(true);

    let response: Response;
    try {
      response = await fetchWithTimeout("/api/auth/account/delete/challenge/verify-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: deleteChallengeId,
          smsCode: deleteSmsCode.trim(),
        }),
      });
    } catch {
      setDeleteError(labels.deleteFlow.errors.unavailable);
      setIsDeleteSubmitting(false);
      return;
    }

    let payload: ApiResponse<{ deleteToken: string }>;
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      setDeleteError(labels.deleteFlow.errors.unavailable);
      setIsDeleteSubmitting(false);
      return;
    }

    if (!response.ok || !payload.success || !payload.data) {
      setDeleteError(resolveAccountDeleteErrorMessage(payload.error, labels));
      setIsDeleteSubmitting(false);
      return;
    }

    setDeleteToken(payload.data.deleteToken);
    setDeleteStep("confirm");
    setIsDeleteSubmitting(false);
  }

  async function completeDeleteAccount() {
    if (isDeleteSubmitting) {
      return;
    }

    setDeleteError(null);
    setDeleteInfo(null);

    if (!deleteChallengeId || !deleteToken) {
      setDeleteError(labels.deleteFlow.errors.tokenInvalid);
      return;
    }

    setIsDeleteSubmitting(true);

    let response: Response;
    try {
      response = await fetchWithTimeout("/api/auth/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: deleteChallengeId,
          deleteToken,
        }),
      });
    } catch {
      setDeleteError(labels.deleteFlow.errors.unavailable);
      setIsDeleteSubmitting(false);
      return;
    }

    let payload: ApiResponse<{ accepted: boolean }>;
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      setDeleteError(labels.deleteFlow.errors.unavailable);
      setIsDeleteSubmitting(false);
      return;
    }

    if (!response.ok || !payload.success || !payload.data?.accepted) {
      setDeleteError(resolveAccountDeleteErrorMessage(payload.error, labels));
      setIsDeleteSubmitting(false);
      return;
    }

    setInfo(labels.feedback.accountDeleted);
    setDeleteInfo(labels.feedback.accountDeleted);
    handleDeleteModalChange(false);
    router.push(withLocale("/login", locale));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="corp-surface corp-surface-pad">
        <div className="space-y-1">
          <h2 className="corp-section-title">{labels.accountTitle}</h2>
          <p className="corp-body-muted">{labels.accountDescription}</p>
        </div>

        <div className="mt-5 space-y-4">
          <div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-background/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="corp-title-base">{labels.endAllSessionsTitle}</p>
              <p className="corp-body-muted">{labels.endAllSessionsDescription}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
              onClick={() => {
                setEndSessionsError(null);
                setIsEndSessionsModalOpen(true);
              }}
            >
              {labels.endAllSessionsAction}
            </Button>
          </div>

          <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 dark:border-red-900/50 dark:bg-red-950/20">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="corp-title-base text-red-700 dark:text-red-200">{labels.deleteAccountTitle}</p>
                <p className="text-sm leading-6 text-red-700/90 dark:text-red-300/90">{labels.deleteAccountDescription}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200"
                onClick={() => handleDeleteModalChange(true)}
              >
                {labels.deleteAccountAction}
              </Button>
            </div>
          </div>
        </div>

        {(error || info) ? (
          <div className="mt-4 space-y-2">
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
          </div>
        ) : null}
      </section>

      <SecurityActiveSessionsPanel
        locale={locale}
        labels={labels}
        activeSessions={activeSessions}
        currentSession={currentSession}
      />

      <SecurityEventsTable
        locale={locale}
        labels={labels}
        events={normalizedEvents}
        auditFailures24h={auditFailures24h}
      />

      <AppModal
        open={isEndSessionsModalOpen}
        onOpenChange={setIsEndSessionsModalOpen}
        title={labels.endAllSessionsModal.title}
        description={labels.endAllSessionsModal.description}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{labels.endAllSessionsConfirm}</p>
          {endSessionsError ? (
            <Alert variant="destructive">
              <AlertDescription>{endSessionsError}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={isEndingSessions}
              onClick={() => setIsEndSessionsModalOpen(false)}
            >
              {labels.endAllSessionsModal.cancel}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
              disabled={isEndingSessions}
              onClick={() => void handleEndAllSessionsConfirm()}
            >
              {isEndingSessions ? labels.actions.processing : labels.endAllSessionsModal.confirm}
            </Button>
          </div>
        </div>
      </AppModal>

      <AppModal
        open={isDeleteModalOpen}
        onOpenChange={handleDeleteModalChange}
        title={labels.deleteFlow.modalTitle}
        description={labels.deleteFlow.modalDescription}
      >
        <div className="space-y-4">
          {deleteStep === "intro" ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{labels.deleteFlow.introDescription}</p>
              <div className="rounded-lg border border-red-200/80 bg-red-50/70 px-3 py-2 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200">
                {labels.deleteFlow.finalWarning}
              </div>
            </div>
          ) : null}

          {deleteStep === "emailCode" ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">{labels.deleteFlow.fields.emailCode}</p>
              <VerificationCodeInput
                id="account-delete-email-code"
                value={deleteEmailCode}
                onChange={setDeleteEmailCode}
                placeholder={labels.deleteFlow.placeholders.code}
                autoFocus
                className="w-full"
              />
              {deleteCountdownSeconds !== null ? (
                <p className="text-xs text-muted-foreground">
                  {labels.deleteFlow.countdownPrefix} {formatCountdown(deleteCountdownSeconds)}
                </p>
              ) : null}
            </div>
          ) : null}

          {deleteStep === "smsCode" ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">{labels.deleteFlow.fields.smsCode}</p>
              {maskedPhone ? (
                <p className="text-xs text-muted-foreground">
                  {labels.deleteFlow.smsSentToPrefix} {maskedPhone}
                </p>
              ) : null}
              <VerificationCodeInput
                id="account-delete-sms-code"
                value={deleteSmsCode}
                onChange={setDeleteSmsCode}
                placeholder={labels.deleteFlow.placeholders.code}
                autoFocus
                className="w-full"
              />
              {deleteCountdownSeconds !== null ? (
                <p className="text-xs text-muted-foreground">
                  {labels.deleteFlow.countdownPrefix} {formatCountdown(deleteCountdownSeconds)}
                </p>
              ) : null}
            </div>
          ) : null}

          {deleteStep === "confirm" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{labels.deleteFlow.confirmDescription}</p>
              <div className="rounded-lg border border-red-200/80 bg-red-50/70 px-3 py-2 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200">
                {labels.deleteFlow.finalWarning}
              </div>
            </div>
          ) : null}

          {(deleteError || deleteInfo) ? (
            <div className="space-y-2">
              {deleteError ? (
                <Alert variant="destructive">
                  <AlertDescription>{deleteError}</AlertDescription>
                </Alert>
              ) : null}
              {deleteInfo ? (
                <Alert>
                  <AlertDescription>{deleteInfo}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={isDeleteSubmitting}
              onClick={() => handleDeleteModalChange(false)}
            >
              {labels.deleteFlow.buttons.cancel}
            </Button>

            {deleteStep === "intro" ? (
              <Button
                type="button"
                variant="destructive"
                disabled={isDeleteSubmitting}
                onClick={() => void requestDeleteEmailCode()}
              >
                {isDeleteSubmitting ? labels.actions.processing : labels.deleteFlow.buttons.sendEmailCode}
              </Button>
            ) : null}

            {deleteStep === "emailCode" ? (
              <>
                {isDeleteCodeExpired ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isDeleteSubmitting}
                    onClick={() => {
                      resetDeleteFlow();
                      void requestDeleteEmailCode();
                    }}
                  >
                    {labels.deleteFlow.buttons.restart}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isDeleteSubmitting}
                  onClick={() => void verifyDeleteEmailCode()}
                >
                  {isDeleteSubmitting ? labels.actions.processing : labels.deleteFlow.buttons.verifyEmailCode}
                </Button>
              </>
            ) : null}

            {deleteStep === "smsCode" ? (
              <>
                {isDeleteCodeExpired ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isDeleteSubmitting}
                    onClick={() => {
                      resetDeleteFlow();
                      void requestDeleteEmailCode();
                    }}
                  >
                    {labels.deleteFlow.buttons.restart}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isDeleteSubmitting}
                  onClick={() => void verifyDeleteSmsCode()}
                >
                  {isDeleteSubmitting ? labels.actions.processing : labels.deleteFlow.buttons.verifySmsCode}
                </Button>
              </>
            ) : null}

            {deleteStep === "confirm" ? (
              <Button
                type="button"
                variant="destructive"
                disabled={isDeleteSubmitting}
                onClick={() => void completeDeleteAccount()}
              >
                {isDeleteSubmitting ? labels.actions.processing : labels.deleteFlow.buttons.completeDelete}
              </Button>
            ) : null}
          </div>
        </div>
      </AppModal>
    </div>
  );
}

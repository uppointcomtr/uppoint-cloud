"use client";

import { startTransition, useActionState, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { TenantRole } from "@prisma/client";
import {
  Building2,
  ChevronRight,
  FolderKanban,
  MapPinned,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { AppModal } from "@/components/shared/app-modal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";
import { TenantCreateForm, type TenantCreateAction } from "@/modules/tenant/components/tenant-create-form";

type TenantPermission =
  | "tenant:read"
  | "tenant:manage_members"
  | "tenant:manage_billing"
  | "tenant:manage_infrastructure";

interface TenantListItem {
  tenantId: string;
  tenantName: string;
  role: TenantRole;
  isDisabled: boolean;
}

interface TenantDetailSnapshot {
  tenantId: string;
  tenantName: string;
  role: TenantRole;
  permissions: TenantPermission[];
  resourceGroups: Array<{
    id: string;
    name: string;
    slug: string;
    regionCode: string;
    createdAtIso: string;
  }>;
  canDelete: boolean;
  deleteBlockedReason: "RESOURCE_GROUPS_PRESENT" | "ROLE_INSUFFICIENT" | "DELETE_DISABLED" | null;
}

interface TenantCenterProps {
  locale: Locale;
  labels: Dictionary["dashboard"]["tenant"];
  tenantErrorCode: "TENANT_NOT_FOUND" | "TENANT_ACCESS_DENIED" | "TENANT_SELECTION_REQUIRED" | null;
  tenants: TenantListItem[];
  selectedTenantDetail: TenantDetailSnapshot | null;
  createTenantAction?: TenantCreateAction;
  deleteTenantAction?: TenantDeleteAction;
}

interface TenantDeleteActionState {
  status: "idle" | "success" | "error";
  code?:
    | "VALIDATION_FAILED"
    | "UNAUTHORIZED"
    | "TENANT_DELETE_DISABLED"
    | "TENANT_DELETE_FORBIDDEN_ROLE"
    | "TENANT_DELETE_BLOCKED_RESOURCE_GROUPS"
    | "TENANT_DELETE_FAILED"
    | "UNKNOWN";
  deletedTenantId?: string;
  nextTenantId?: string | null;
}

type TenantDeleteAction = (
  previousState: TenantDeleteActionState,
  formData: FormData,
) => Promise<TenantDeleteActionState>;

const ROLE_ORDER: TenantRole[] = ["OWNER", "ADMIN", "MEMBER"];
const INITIAL_DELETE_STATE: TenantDeleteActionState = { status: "idle" };

function resolveTenantStatusMessage(
  tenantErrorCode: TenantCenterProps["tenantErrorCode"],
  labels: Dictionary["dashboard"]["tenant"],
): string | null {
  if (tenantErrorCode === "TENANT_NOT_FOUND") {
    return labels.noMembership;
  }

  if (tenantErrorCode === "TENANT_SELECTION_REQUIRED") {
    return labels.selectionRequired;
  }

  if (tenantErrorCode === "TENANT_ACCESS_DENIED") {
    return labels.accessDenied;
  }

  return null;
}

function formatDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function roleTone(role: TenantRole): string {
  switch (role) {
    case "OWNER":
      return "corp-role-owner";
    case "ADMIN":
      return "corp-role-admin";
    case "MEMBER":
    default:
      return "corp-role-member";
  }
}

function disabledRowClass(isDisabled: boolean): string {
  return isDisabled
    ? "cursor-not-allowed opacity-60"
    : "corp-motion-interactive group hover:bg-accent/40";
}

function resolveDeleteErrorMessage(
  state: TenantDeleteActionState,
  labels: Dictionary["dashboard"]["tenant"]["delete"]["errors"],
): string | null {
  if (state.status !== "error") {
    return null;
  }

  if (!state.code) {
    return labels.UNKNOWN;
  }

  return labels[state.code] ?? labels.UNKNOWN;
}

export function TenantCenter({
  locale,
  labels,
  tenantErrorCode,
  tenants,
  selectedTenantDetail,
  createTenantAction,
  deleteTenantAction,
}: TenantCenterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const totalTenants = tenants.length;
  const statusMessage = resolveTenantStatusMessage(tenantErrorCode, labels);

  function buildTenantQuery(tenantView: string | null): string {
    const params = new URLSearchParams(searchParams.toString());
    if (tenantView) {
      params.set("tenantView", tenantView);
    } else {
      params.delete("tenantView");
    }

    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function openTenantDetail(tenantId: string) {
    router.push(buildTenantQuery(tenantId), { scroll: false });
  }

  function closeTenantDetail() {
    router.replace(buildTenantQuery(null), { scroll: false });
  }

  function handleTenantDeleted() {
    startTransition(() => {
      router.replace(buildTenantQuery(null), { scroll: false });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card className="corp-surface bg-card/95">
        <CardHeader className="corp-surface-header gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="corp-section-title">{labels.title}</CardTitle>
            <CardDescription className="corp-body-muted">{labels.description}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              {labels.summary.totalTenants}: <span className="text-foreground">{totalTenants}</span>
            </span>
          </div>
        </CardHeader>
        <CardContent className="corp-surface-body space-y-5">
          {statusMessage ? (
            <Alert className="border-border/70 bg-background/70">
              <AlertDescription>{statusMessage}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="corp-section-title">{labels.list.title}</h3>
                <p className="corp-body-muted">{labels.list.description}</p>
              </div>
            </div>

            {tenants.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-border/70 bg-background/70">
                <div className="corp-table-head hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_130px_84px] items-center gap-3 border-b border-border/70 bg-muted/30 px-4 py-3 md:grid">
                  <span>{labels.list.columns.name}</span>
                  <span>{labels.list.columns.id}</span>
                  <span>{labels.list.columns.role}</span>
                  <span className="text-right">{labels.list.columns.action}</span>
                </div>

                <div className="divide-y divide-border/60">
                  {tenants.map((tenant) => (
                    <button
                      key={`${tenant.tenantId}-${tenant.role}`}
                      type="button"
                      onClick={() => {
                        if (!tenant.isDisabled) {
                          openTenantDetail(tenant.tenantId);
                        }
                      }}
                      disabled={tenant.isDisabled}
                      className={cn("w-full text-left", disabledRowClass(tenant.isDisabled))}
                    >
                      <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_130px_84px] items-center gap-3 px-4 py-3.5 md:grid">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-card text-foreground shadow-sm">
                            <Building2 className="size-4.5" />
                          </div>
                          <p className="truncate text-sm font-semibold text-foreground">{tenant.tenantName}</p>
                        </div>

                        <p className="truncate font-mono text-xs text-muted-foreground">{tenant.tenantId}</p>

                        <span className={cn("inline-flex w-fit rounded-full border px-2.5 py-1 text-[11px] font-semibold", roleTone(tenant.role))}>
                          {labels.roleNames[tenant.role]}
                        </span>

                        {tenant.isDisabled ? (
                          <span className="inline-flex items-center justify-end gap-1.5 text-xs font-medium text-muted-foreground">
                            {labels.list.cancelledBadge}
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-end gap-1.5 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                            {labels.list.openDetails}
                            <ChevronRight className="size-4" />
                          </span>
                        )}
                      </div>

                      <div className="space-y-2 px-4 py-3.5 md:hidden">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-semibold text-foreground">{tenant.tenantName}</p>
                          <ChevronRight className="size-4 text-muted-foreground" />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold", roleTone(tenant.role))}>
                            {labels.roleNames[tenant.role]}
                          </span>
                          {tenant.isDisabled ? (
                            <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                              {labels.list.cancelledBadge}
                            </span>
                          ) : null}
                        </div>
                        <p className="font-mono text-xs text-muted-foreground">{tenant.tenantId}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/70 bg-background/60 px-5 py-8 text-center">
                <p className="corp-title-base">{labels.list.emptyTitle}</p>
                <p className="corp-body-muted mt-1">{labels.list.emptyDescription}</p>
              </div>
            )}
          </div>

          {createTenantAction ? (
            <TenantCreateForm
              locale={locale}
              createTenantAction={createTenantAction}
              labels={{
                title: labels.create.title,
                description: labels.create.description,
                fieldName: labels.create.fieldName,
                submitIdle: labels.create.submitIdle,
                submitLoading: labels.create.submitLoading,
                success: labels.create.success,
                errors: labels.create.errors,
              }}
            />
          ) : null}
        </CardContent>
      </Card>

      <AppModal
        open={Boolean(selectedTenantDetail)}
        onOpenChange={(open) => {
          if (!open) {
            closeTenantDetail();
          }
        }}
        title={selectedTenantDetail ? selectedTenantDetail.tenantName : labels.details.title}
        description={labels.details.description}
        className="max-w-5xl"
      >
        {selectedTenantDetail ? (
          <TenantDetailModalBody
            key={selectedTenantDetail.tenantId}
            locale={locale}
            labels={labels}
            detail={selectedTenantDetail}
            deleteTenantAction={deleteTenantAction}
            onTenantDeleted={handleTenantDeleted}
          />
        ) : null}
      </AppModal>
    </div>
  );
}

function TenantDetailModalBody({
  locale,
  labels,
  detail,
  deleteTenantAction,
  onTenantDeleted,
}: {
  locale: Locale;
  labels: Dictionary["dashboard"]["tenant"];
  detail: TenantDetailSnapshot;
  deleteTenantAction?: TenantDeleteAction;
  onTenantDeleted: () => void;
}) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteState, runDeleteTenantAction, isDeletePending] = useActionState(
    async (previousState: TenantDeleteActionState, formData: FormData) => {
      if (!deleteTenantAction) {
        const fallbackState: TenantDeleteActionState = {
          status: "error",
          code: "UNKNOWN",
        };
        return fallbackState;
      }

      return deleteTenantAction(previousState, formData);
    },
    INITIAL_DELETE_STATE,
  );
  const selectedRoleCards = useMemo(
    () =>
      ROLE_ORDER.map((role) => ({
        role,
        isActive: detail.role === role,
      })),
    [detail.role],
  );
  const deleteBlockedMessage = detail.deleteBlockedReason === "RESOURCE_GROUPS_PRESENT"
    ? labels.delete.errors.TENANT_DELETE_BLOCKED_RESOURCE_GROUPS
    : detail.deleteBlockedReason === "ROLE_INSUFFICIENT"
      ? labels.delete.errors.TENANT_DELETE_FORBIDDEN_ROLE
      : null;
  const deleteErrorMessage = resolveDeleteErrorMessage(deleteState, labels.delete.errors);

  useEffect(() => {
    if (deleteState.status !== "success") {
      return;
    }

    onTenantDeleted();
  }, [deleteState.status, onTenantDeleted]);

  return (
    <div className="relative space-y-6">
      <section className="corp-subcard border-border/70">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", roleTone(detail.role))}>
                {labels.roleNames[detail.role]}
              </span>
            </div>
            <div className="space-y-1">
              <p className="corp-body-muted">{labels.details.summary}</p>
              <p className="font-mono text-xs text-foreground/80">{detail.tenantId}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-card/80 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                <FolderKanban className="size-4" />
                {labels.details.metrics.resourceGroups}
              </div>
              <p className="mt-2 text-2xl font-semibold text-foreground">{detail.resourceGroups.length}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card/80 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                <ShieldCheck className="size-4" />
                {labels.details.metrics.role}
              </div>
              <p className="mt-2 text-2xl font-semibold text-foreground">{labels.roleNames[detail.role]}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="corp-subcard border-border/70">
          <div className="space-y-1">
            <h3 className="corp-section-title">{labels.details.resourceGroups.title}</h3>
            <p className="corp-body-muted">{labels.details.resourceGroups.description}</p>
          </div>

          {detail.resourceGroups.length > 0 ? (
            <div className="mt-4 space-y-3">
              {detail.resourceGroups.map((resourceGroup) => (
                <div
                  key={resourceGroup.id}
                  className="rounded-2xl border border-border/70 bg-card/80 px-4 py-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{resourceGroup.name}</p>
                        <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                          {labels.details.resourceGroups.active}
                        </span>
                      </div>
                      <p className="corp-field-hint font-mono">{resourceGroup.slug}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/80 px-2.5 py-1">
                        <MapPinned className="size-3.5" />
                        {resourceGroup.regionCode}
                      </span>
                      <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1">
                        {formatDate(resourceGroup.createdAtIso, locale)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-border/70 bg-card/70 px-4 py-8 text-center">
              <p className="corp-title-base">{labels.details.resourceGroups.emptyTitle}</p>
              <p className="corp-body-muted mt-1">{labels.details.resourceGroups.emptyDescription}</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="corp-subcard border-border/70">
            <div className="space-y-1">
              <h3 className="corp-section-title">{labels.details.roles.title}</h3>
              <p className="corp-body-muted">{labels.details.roles.description}</p>
            </div>
            <div className="mt-4 space-y-3">
              {selectedRoleCards.map((roleCard) => (
                <div
                  key={roleCard.role}
                  className={cn(
                    "rounded-2xl border px-4 py-3",
                    roleCard.isActive
                      ? "border-primary/30 bg-primary/8"
                      : "border-border/70 bg-card/80",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{labels.roleNames[roleCard.role]}</p>
                      <p className="corp-body-muted mt-1">{labels.roleDescriptions[roleCard.role]}</p>
                    </div>
                    {roleCard.isActive ? (
                      <span className="rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-[11px] font-semibold text-primary">
                        {labels.details.roles.current}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="destructive"
              className="corp-btn-md"
              disabled={!deleteTenantAction}
              onClick={() => {
                setDeleteConfirmOpen(true);
              }}
            >
              <Trash2 className="size-4" />
              {labels.delete.submit}
            </Button>
          </div>
        </div>
      </section>

      {deleteConfirmOpen ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl">
          <button
            type="button"
            aria-label="Close tenant cancel confirmation"
            className="absolute inset-0 rounded-2xl bg-black/35"
            onClick={() => {
              setDeleteConfirmOpen(false);
            }}
          />

          <section className="relative z-10 w-full max-w-md rounded-2xl border border-border/70 bg-card p-5 shadow-xl">
            <div className="space-y-1">
              <h3 className="corp-section-title">{labels.delete.confirmTitle}</h3>
              <p className="corp-body-muted">{labels.delete.confirmDescription}</p>
            </div>
            <form action={runDeleteTenantAction} className="mt-4 space-y-4">
              <input type="hidden" name="tenantId" value={detail.tenantId} />
              <p className="corp-body-muted">{labels.delete.confirmPrompt}</p>

              {deleteBlockedMessage ? (
                <p className="text-sm text-destructive">{deleteBlockedMessage}</p>
              ) : null}

              {deleteErrorMessage ? (
                <p className="text-sm text-destructive">{deleteErrorMessage}</p>
              ) : null}

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="corp-btn-md"
                  onClick={() => {
                    setDeleteConfirmOpen(false);
                  }}
                >
                  {labels.delete.confirmCancel}
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  className="corp-btn-md"
                  disabled={isDeletePending || Boolean(deleteBlockedMessage)}
                >
                  {labels.delete.confirmApprove}
                </Button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

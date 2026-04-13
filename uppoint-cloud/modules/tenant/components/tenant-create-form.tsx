"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Locale } from "@/modules/i18n/config";
import { withLocale } from "@/modules/i18n/paths";

export interface TenantCreateActionState {
  status: "idle" | "success" | "error";
  code?: "VALIDATION_FAILED" | "UNAUTHORIZED" | "TENANT_CREATE_FAILED" | "TENANT_SLUG_RETRY_EXHAUSTED" | "UNKNOWN";
  scopeId?: string;
}

export type TenantCreateAction = (
  previousState: TenantCreateActionState,
  formData: FormData,
) => Promise<TenantCreateActionState>;

interface TenantCreateFormLabels {
  title: string;
  description: string;
  fieldName: string;
  submitIdle: string;
  submitLoading: string;
  success: string;
  errors: {
    VALIDATION_FAILED: string;
    UNAUTHORIZED: string;
    TENANT_CREATE_FAILED: string;
    TENANT_SLUG_RETRY_EXHAUSTED: string;
    UNKNOWN: string;
  };
}

interface TenantCreateFormProps {
  locale: Locale;
  labels: TenantCreateFormLabels;
  createTenantAction: TenantCreateAction;
}

const INITIAL_STATE: TenantCreateActionState = {
  status: "idle",
};

function resolveErrorMessage(state: TenantCreateActionState, labels: TenantCreateFormLabels["errors"]): string | null {
  if (state.status !== "error") {
    return null;
  }

  if (!state.code) {
    return labels.UNKNOWN;
  }

  return labels[state.code] ?? labels.UNKNOWN;
}

export function TenantCreateForm({
  locale,
  labels,
  createTenantAction,
}: TenantCreateFormProps) {
  const router = useRouter();
  const lastRedirectRef = useRef<string | null>(null);
  const [state, runCreateTenantAction, isPending] = useActionState(
    async (previousState: TenantCreateActionState, formData: FormData) => createTenantAction(previousState, formData),
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state.status !== "success" || !state.scopeId) {
      return;
    }

    const targetPath = `${withLocale("/dashboard/tenant", locale)}?tenantId=${encodeURIComponent(state.scopeId)}`;
    if (lastRedirectRef.current === targetPath) {
      return;
    }
    lastRedirectRef.current = targetPath;

    startTransition(() => {
      router.replace(targetPath);
      router.refresh();
    });

    const fallbackTimer = window.setTimeout(() => {
      const currentPath = `${window.location.pathname}${window.location.search}`;
      if (currentPath !== targetPath) {
        window.location.assign(targetPath);
      }
    }, 900);

    return () => {
      window.clearTimeout(fallbackTimer);
    };
  }, [locale, router, state.scopeId, state.status]);

  const errorMessage = resolveErrorMessage(state, labels.errors);

  return (
    <div className="mt-4 rounded-lg border border-border/60 bg-background/60 p-4">
      <p className="text-sm font-medium text-foreground">{labels.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{labels.description}</p>

      <form action={runCreateTenantAction} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full space-y-2 sm:flex-1">
          <Label htmlFor="tenant-name">{labels.fieldName}</Label>
          <Input
            id="tenant-name"
            name="name"
            minLength={3}
            maxLength={80}
            required
            disabled={isPending}
          />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? labels.submitLoading : labels.submitIdle}
        </Button>
      </form>

      {state.status === "success" ? (
        <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-300">{labels.success}</p>
      ) : null}

      {errorMessage ? (
        <p className="mt-3 text-sm text-destructive">{errorMessage}</p>
      ) : null}
    </div>
  );
}

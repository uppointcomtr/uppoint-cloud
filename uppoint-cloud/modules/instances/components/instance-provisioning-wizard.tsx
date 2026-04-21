"use client";

import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";
import { withLocale } from "@/modules/i18n/paths";

export interface InstanceWizardActionState {
  status: "idle" | "success" | "error";
  code?: string;
  message?: string;
  resourceGroupId?: string;
  jobId?: string;
  instanceId?: string | null;
  reused?: boolean;
}

type InstanceWizardAction = (
  previousState: InstanceWizardActionState,
  formData: FormData,
) => Promise<InstanceWizardActionState>;

interface ResourceGroupModel {
  id: string;
  name: string;
  slug: string;
  regionCode: string;
}

interface NetworkModel {
  id: string;
  resourceGroupId: string;
  name: string;
  cidr: string;
}

interface FirewallPolicyModel {
  id: string;
  resourceGroupId: string;
  name: string;
  description: string | null;
}

interface RegionCatalogModel {
  code: string;
  label: string;
}

interface PlanCatalogModel {
  code: string;
  label: string;
  cpuCores: number;
  memoryMb: number;
  diskGb: number;
}

interface ImageCatalogModel {
  code: string;
  label: string;
}

interface TenantOptionModel {
  tenantId: string;
  tenantName: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  isSelected: boolean;
}

interface InstanceWizardViewModel {
  selectedTenantId: string;
  selectedTenantRole: "OWNER" | "ADMIN" | "MEMBER";
  tenantOptions: TenantOptionModel[];
  resourceGroups: ResourceGroupModel[];
  networks: NetworkModel[];
  firewallPolicies: FirewallPolicyModel[];
  regionCatalog: RegionCatalogModel[];
  planCatalog: PlanCatalogModel[];
  imageCatalog: ImageCatalogModel[];
}

interface InstanceProvisioningWizardProps {
  locale: Locale;
  labels: Dictionary["dashboard"]["instancesWizard"];
  model: InstanceWizardViewModel;
  createResourceGroupAction: InstanceWizardAction;
  submitProvisioningAction: InstanceWizardAction;
}

const INITIAL_ACTION_STATE: InstanceWizardActionState = { status: "idle" };
const SELECT_CLASS_NAME = "corp-select";

function createUuidV4(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : ((random & 0x3) | 0x8);
    return value.toString(16);
  });
}

function resolveErrorMessage(
  state: InstanceWizardActionState,
  labels: Dictionary["dashboard"]["instancesWizard"]["errors"],
): string | null {
  if (state.status !== "error") {
    return null;
  }

  const code = state.code ?? "UNKNOWN";
  return labels[code as keyof typeof labels] ?? labels.UNKNOWN;
}

export function InstanceProvisioningWizard({
  locale,
  labels,
  model,
  createResourceGroupAction,
  submitProvisioningAction,
}: InstanceProvisioningWizardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedResourceGroupId, setSelectedResourceGroupId] = useState(
    model.resourceGroups[0]?.id ?? "",
  );
  const [selectedPlanCode, setSelectedPlanCode] = useState(
    model.planCatalog[0]?.code ?? "",
  );
  const [idempotencyKey, setIdempotencyKey] = useState(() => createUuidV4());

  const [createState, runCreateResourceGroup, isCreatePending] = useActionState(
    async (previousState: InstanceWizardActionState, formData: FormData) => {
      const nextState = await createResourceGroupAction(previousState, formData);
      if (nextState.status === "success") {
        if (nextState.resourceGroupId) {
          setSelectedResourceGroupId(nextState.resourceGroupId);
        }
        startTransition(() => {
          router.refresh();
        });
      }
      return nextState;
    },
    INITIAL_ACTION_STATE,
  );
  const [submitState, runSubmitProvisioning, isSubmitPending] = useActionState(
    async (previousState: InstanceWizardActionState, formData: FormData) => {
      const nextState = await submitProvisioningAction(previousState, formData);
      if (nextState.status === "success") {
        setIdempotencyKey(createUuidV4());
      }
      return nextState;
    },
    INITIAL_ACTION_STATE,
  );
  const canManageResources = model.selectedTenantRole === "OWNER" || model.selectedTenantRole === "ADMIN";
  const effectiveResourceGroupId = selectedResourceGroupId || model.resourceGroups[0]?.id || "";
  const backToModulesHref = model.selectedTenantId
    ? `${withLocale("/dashboard/modules", locale)}?tenantId=${encodeURIComponent(model.selectedTenantId)}`
    : withLocale("/dashboard/modules", locale);

  const availableNetworks = model.networks.filter((network) =>
    network.resourceGroupId === effectiveResourceGroupId);
  const availableFirewallPolicies = model.firewallPolicies.filter((policy) =>
    policy.resourceGroupId === effectiveResourceGroupId);
  const selectedResourceGroup = model.resourceGroups.find((item) => item.id === effectiveResourceGroupId) ?? null;
  const selectedRegionLabel = selectedResourceGroup
    ? (model.regionCatalog.find((item) => item.code === selectedResourceGroup.regionCode)?.label ?? selectedResourceGroup.regionCode)
    : "";
  const selectedPlan = model.planCatalog.find((item) => item.code === selectedPlanCode)
    ?? model.planCatalog[0]
    ?? null;
  const createErrorMessage = resolveErrorMessage(createState, labels.errors);
  const submitErrorMessage = resolveErrorMessage(submitState, labels.errors);
  const isProvisioningFormLocked = !canManageResources || isSubmitPending || model.resourceGroups.length === 0;
  const canSubmitProvisioning =
    !isProvisioningFormLocked
    && Boolean(selectedResourceGroup)
    && availableNetworks.length > 0
    && availableFirewallPolicies.length > 0;

  function handleTenantChange(tenantId: string) {
    if (!tenantId || tenantId === model.selectedTenantId) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("tenantId", tenantId);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="space-y-6">
      <Card className="corp-surface">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="corp-section-title">{labels.title}</CardTitle>
              <CardDescription className="corp-body-muted mt-1">{labels.description}</CardDescription>
            </div>
            <Button asChild size="sm" variant="outline" className="corp-btn-sm">
              <Link href={backToModulesHref}>
                {labels.backToModules}
              </Link>
            </Button>
          </div>
          <div className="corp-subcard-sm text-sm">
            <div className="space-y-2">
              <div className="space-y-2">
                <Label htmlFor="wizard-tenant-selector" className="corp-field-label">{labels.tenantSelectionLabel}</Label>
                <select
                  id="wizard-tenant-selector"
                  value={model.selectedTenantId}
                  onChange={(event) => handleTenantChange(event.currentTarget.value)}
                  className={SELECT_CLASS_NAME}
                >
                  {model.tenantOptions.map((tenantOption) => (
                    <option key={tenantOption.tenantId} value={tenantOption.tenantId}>
                      {tenantOption.tenantName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {!canManageResources ? (
              <p className="mt-2 text-sm text-amber-600 dark:text-amber-300">{labels.roleInsufficient}</p>
            ) : null}
          </div>
        </CardHeader>
      </Card>

      <Card className="corp-surface">
        <CardHeader className="pb-4">
          <CardTitle className="corp-section-title">{labels.sections.resourceGroup.title}</CardTitle>
          <CardDescription className="corp-body-muted">{labels.sections.resourceGroup.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={runCreateResourceGroup} className="grid gap-4 md:grid-cols-3">
            <input type="hidden" name="tenantId" value={model.selectedTenantId} />
            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="rg-name" className="corp-field-label">{labels.sections.resourceGroup.fields.name}</Label>
              <Input
                id="rg-name"
                name="name"
                className="corp-input"
                minLength={3}
                maxLength={80}
                required
                disabled={!canManageResources || isCreatePending}
              />
            </div>
            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="rg-slug" className="corp-field-label">{labels.sections.resourceGroup.fields.slug}</Label>
              <Input
                id="rg-slug"
                name="slug"
                className="corp-input"
                pattern="^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$"
                minLength={3}
                maxLength={40}
                required
                disabled={!canManageResources || isCreatePending}
              />
            </div>
            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="rg-region" className="corp-field-label">{labels.sections.resourceGroup.fields.region}</Label>
              <select
                id="rg-region"
                name="regionCode"
                className={SELECT_CLASS_NAME}
                defaultValue={model.regionCatalog[0]?.code}
                disabled={!canManageResources || isCreatePending}
                required
              >
                {model.regionCatalog.map((region) => (
                  <option key={region.code} value={region.code}>
                    {region.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <Button type="submit" className="corp-btn-md" disabled={!canManageResources || isCreatePending}>
                {isCreatePending ? labels.sections.resourceGroup.createLoading : labels.sections.resourceGroup.createIdle}
              </Button>
            </div>
          </form>
          {createState.status === "success" ? (
            <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-300">
              {labels.sections.resourceGroup.createSuccess}
            </p>
          ) : null}
          {createErrorMessage ? (
            <p className="mt-3 text-sm text-destructive">{createErrorMessage}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="corp-surface">
        <CardHeader className="pb-4">
          <CardTitle className="corp-section-title">{labels.sections.instance.title}</CardTitle>
          <CardDescription className="corp-body-muted">{labels.sections.instance.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {model.resourceGroups.length === 0 ? (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
              {labels.sections.instance.noResourceGroups}
            </p>
          ) : null}

          <form action={runSubmitProvisioning} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="tenantId" value={model.selectedTenantId} />
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
            <input type="hidden" name="regionCode" value={selectedResourceGroup?.regionCode ?? ""} />

            <div className="space-y-2">
              <Label htmlFor="instance-resource-group" className="corp-field-label">{labels.sections.instance.fields.resourceGroup}</Label>
              <select
                id="instance-resource-group"
                name="resourceGroupId"
                value={effectiveResourceGroupId}
                onChange={(event) => setSelectedResourceGroupId(event.currentTarget.value)}
                className={SELECT_CLASS_NAME}
                disabled={isProvisioningFormLocked}
                required
              >
                {model.resourceGroups.length === 0 ? (
                  <option value="">{labels.sections.instance.noResourceGroups}</option>
                ) : null}
                {model.resourceGroups.map((resourceGroup) => (
                  <option key={resourceGroup.id} value={resourceGroup.id}>
                    {resourceGroup.name} ({resourceGroup.regionCode})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="instance-network" className="corp-field-label">{labels.sections.instance.fields.network}</Label>
              <select
                key={`network-${effectiveResourceGroupId}`}
                id="instance-network"
                name="networkId"
                className={SELECT_CLASS_NAME}
                disabled={isProvisioningFormLocked || availableNetworks.length === 0}
                required
                defaultValue={availableNetworks[0]?.id ?? ""}
              >
                {availableNetworks.length === 0 ? (
                  <option value="">{labels.sections.instance.fields.network}</option>
                ) : null}
                {availableNetworks.map((network) => (
                  <option key={network.id} value={network.id}>
                    {network.name} ({network.cidr})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="instance-firewall" className="corp-field-label">{labels.sections.instance.fields.firewallPolicy}</Label>
              <select
                key={`firewall-${effectiveResourceGroupId}`}
                id="instance-firewall"
                name="firewallPolicyId"
                className={SELECT_CLASS_NAME}
                disabled={isProvisioningFormLocked || availableFirewallPolicies.length === 0}
                required
                defaultValue={availableFirewallPolicies[0]?.id ?? ""}
              >
                {availableFirewallPolicies.length === 0 ? (
                  <option value="">{labels.sections.instance.fields.firewallPolicy}</option>
                ) : null}
                {availableFirewallPolicies.map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="instance-name" className="corp-field-label">{labels.sections.instance.fields.name}</Label>
              <Input
                id="instance-name"
                name="name"
                className="corp-input"
                pattern="^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$"
                minLength={3}
                maxLength={63}
                required
                disabled={isProvisioningFormLocked}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instance-plan" className="corp-field-label">{labels.sections.instance.fields.plan}</Label>
              <select
                id="instance-plan"
                name="planCode"
                value={selectedPlanCode}
                onChange={(event) => setSelectedPlanCode(event.currentTarget.value)}
                className={SELECT_CLASS_NAME}
                disabled={isProvisioningFormLocked}
                required
              >
                {model.planCatalog.map((plan) => (
                  <option key={plan.code} value={plan.code}>
                    {plan.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="instance-image" className="corp-field-label">{labels.sections.instance.fields.image}</Label>
              <select
                id="instance-image"
                name="imageCode"
                className={SELECT_CLASS_NAME}
                disabled={isProvisioningFormLocked}
                required
                defaultValue={model.imageCatalog[0]?.code}
              >
                {model.imageCatalog.map((image) => (
                  <option key={image.code} value={image.code}>
                    {image.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="instance-region" className="corp-field-label">{labels.sections.instance.fields.region}</Label>
              <Input
                id="instance-region"
                className="corp-input"
                value={selectedRegionLabel}
                readOnly
                disabled
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instance-admin" className="corp-field-label">{labels.sections.instance.fields.adminUsername}</Label>
              <Input
                id="instance-admin"
                name="adminUsername"
                className="corp-input"
                pattern="^[a-z_][a-z0-9_-]{1,31}$"
                defaultValue="cloudadmin"
                required
                disabled={isProvisioningFormLocked}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instance-cpu" className="corp-field-label">{labels.sections.instance.fields.cpuCores}</Label>
              <Input
                key={`cpu-${selectedPlanCode}`}
                id="instance-cpu"
                name="cpuCores"
                type="number"
                className="corp-input"
                min={selectedPlan?.cpuCores ?? 1}
                max={64}
                defaultValue={String(selectedPlan?.cpuCores ?? 1)}
                required
                disabled={isProvisioningFormLocked}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instance-memory" className="corp-field-label">{labels.sections.instance.fields.memoryMb}</Label>
              <Input
                key={`memory-${selectedPlanCode}`}
                id="instance-memory"
                name="memoryMb"
                type="number"
                className="corp-input"
                min={selectedPlan?.memoryMb ?? 1024}
                max={262144}
                defaultValue={String(selectedPlan?.memoryMb ?? 1024)}
                required
                disabled={isProvisioningFormLocked}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instance-disk" className="corp-field-label">{labels.sections.instance.fields.diskGb}</Label>
              <Input
                key={`disk-${selectedPlanCode}`}
                id="instance-disk"
                name="diskGb"
                type="number"
                className="corp-input"
                min={selectedPlan?.diskGb ?? 20}
                max={4096}
                defaultValue={String(selectedPlan?.diskGb ?? 20)}
                required
                disabled={isProvisioningFormLocked}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="instance-ssh-key" className="corp-field-label">{labels.sections.instance.fields.sshPublicKey}</Label>
              <textarea
                id="instance-ssh-key"
                name="sshPublicKey"
                rows={3}
                maxLength={2048}
                className="corp-textarea"
                disabled={isProvisioningFormLocked}
              />
            </div>

            <div className="md:col-span-2">
              <Button type="submit" className="corp-btn-md" disabled={!canSubmitProvisioning || isSubmitPending || !canManageResources}>
                {isSubmitPending ? labels.sections.instance.submitLoading : labels.sections.instance.submitIdle}
              </Button>
            </div>
          </form>

          <p className="corp-field-hint">{labels.hints.idempotency}</p>

          {submitState.status === "success" ? (
            <div className="space-y-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              <p>{labels.sections.instance.submitSuccess}</p>
              {submitState.reused ? (
                <p>{labels.sections.instance.submitReused}</p>
              ) : null}
              {submitState.jobId ? <p>Job: {submitState.jobId}</p> : null}
              {submitState.instanceId ? <p>Instance: {submitState.instanceId}</p> : null}
            </div>
          ) : null}

          {submitErrorMessage ? (
            <p className="text-sm text-destructive">{submitErrorMessage}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

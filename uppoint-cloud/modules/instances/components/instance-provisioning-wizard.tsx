"use client";

import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

interface InstanceWizardViewModel {
  selectedTenantId: string;
  selectedTenantRole: "OWNER" | "ADMIN" | "MEMBER";
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
const SELECT_CLASS_NAME = "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

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

  return (
    <div className="space-y-6">
      <Card className="border-border/70 bg-card/90 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="corp-section-title">{labels.title}</CardTitle>
              <CardDescription className="corp-body-muted mt-1">{labels.description}</CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href={backToModulesHref}>
                {labels.backToModules}
              </Link>
            </Button>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/60 p-3 text-sm">
            <p>
              <span className="text-muted-foreground">{labels.tenantLabel}:</span> {model.selectedTenantId}
            </p>
            <p className="mt-1">
              <span className="text-muted-foreground">{labels.tenantRoleLabel}:</span> {model.selectedTenantRole}
            </p>
            {!canManageResources ? (
              <p className="mt-2 text-sm text-amber-600 dark:text-amber-300">{labels.roleInsufficient}</p>
            ) : null}
          </div>
        </CardHeader>
      </Card>

      <Card className="border-border/70 bg-card/90 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="corp-section-title">{labels.sections.resourceGroup.title}</CardTitle>
          <CardDescription>{labels.sections.resourceGroup.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={runCreateResourceGroup} className="grid gap-4 md:grid-cols-3">
            <input type="hidden" name="tenantId" value={model.selectedTenantId} />
            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="rg-name">{labels.sections.resourceGroup.fields.name}</Label>
              <Input
                id="rg-name"
                name="name"
                minLength={3}
                maxLength={80}
                required
                disabled={!canManageResources || isCreatePending}
              />
            </div>
            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="rg-slug">{labels.sections.resourceGroup.fields.slug}</Label>
              <Input
                id="rg-slug"
                name="slug"
                pattern="^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$"
                minLength={3}
                maxLength={40}
                required
                disabled={!canManageResources || isCreatePending}
              />
            </div>
            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="rg-region">{labels.sections.resourceGroup.fields.region}</Label>
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
              <Button type="submit" disabled={!canManageResources || isCreatePending}>
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

      <Card className="border-border/70 bg-card/90 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="corp-section-title">{labels.sections.instance.title}</CardTitle>
          <CardDescription>{labels.sections.instance.description}</CardDescription>
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
              <Label htmlFor="instance-resource-group">{labels.sections.instance.fields.resourceGroup}</Label>
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
              <Label htmlFor="instance-network">{labels.sections.instance.fields.network}</Label>
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
              <Label htmlFor="instance-firewall">{labels.sections.instance.fields.firewallPolicy}</Label>
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
              <Label htmlFor="instance-name">{labels.sections.instance.fields.name}</Label>
              <Input
                id="instance-name"
                name="name"
                pattern="^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$"
                minLength={3}
                maxLength={63}
                required
                disabled={isProvisioningFormLocked}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instance-plan">{labels.sections.instance.fields.plan}</Label>
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
              <Label htmlFor="instance-image">{labels.sections.instance.fields.image}</Label>
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
              <Label htmlFor="instance-region">{labels.sections.instance.fields.region}</Label>
              <Input
                id="instance-region"
                value={selectedRegionLabel}
                readOnly
                disabled
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instance-admin">{labels.sections.instance.fields.adminUsername}</Label>
              <Input
                id="instance-admin"
                name="adminUsername"
                pattern="^[a-z_][a-z0-9_-]{1,31}$"
                defaultValue="cloudadmin"
                required
                disabled={isProvisioningFormLocked}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instance-cpu">{labels.sections.instance.fields.cpuCores}</Label>
              <Input
                key={`cpu-${selectedPlanCode}`}
                id="instance-cpu"
                name="cpuCores"
                type="number"
                min={selectedPlan?.cpuCores ?? 1}
                max={64}
                defaultValue={String(selectedPlan?.cpuCores ?? 1)}
                required
                disabled={isProvisioningFormLocked}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instance-memory">{labels.sections.instance.fields.memoryMb}</Label>
              <Input
                key={`memory-${selectedPlanCode}`}
                id="instance-memory"
                name="memoryMb"
                type="number"
                min={selectedPlan?.memoryMb ?? 1024}
                max={262144}
                defaultValue={String(selectedPlan?.memoryMb ?? 1024)}
                required
                disabled={isProvisioningFormLocked}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instance-disk">{labels.sections.instance.fields.diskGb}</Label>
              <Input
                key={`disk-${selectedPlanCode}`}
                id="instance-disk"
                name="diskGb"
                type="number"
                min={selectedPlan?.diskGb ?? 20}
                max={4096}
                defaultValue={String(selectedPlan?.diskGb ?? 20)}
                required
                disabled={isProvisioningFormLocked}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="instance-ssh-key">{labels.sections.instance.fields.sshPublicKey}</Label>
              <textarea
                id="instance-ssh-key"
                name="sshPublicKey"
                rows={3}
                maxLength={2048}
                className="border-input w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
                disabled={isProvisioningFormLocked}
              />
            </div>

            <div className="md:col-span-2">
              <Button type="submit" disabled={!canSubmitProvisioning || isSubmitPending || !canManageResources}>
                {isSubmitPending ? labels.sections.instance.submitLoading : labels.sections.instance.submitIdle}
              </Button>
            </div>
          </form>

          <p className="text-xs text-muted-foreground">{labels.hints.idempotency}</p>

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

import Link from "next/link";
import {
  Activity,
  Boxes,
  Clock3,
  Network,
  Plus,
  Server,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";
import type {
  FirewallPolicyHierarchyView,
  InstanceProvisioningJobHierarchyView,
  InstanceResourceGroupHierarchyView,
  ResourceGroupHierarchyView,
} from "@/modules/instances/domain/contracts";

interface ResourceGroupHierarchyProps {
  locale: Locale;
  labels: Dictionary["dashboard"]["modules"];
  hierarchy: InstanceResourceGroupHierarchyView;
  tenantName: string;
  tenantRole: string;
  setupHref: string;
}

function formatDateTime(value: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatMemory(memoryMb: number): string {
  if (memoryMb >= 1024 && memoryMb % 1024 === 0) {
    return `${memoryMb / 1024} GB`;
  }

  return `${memoryMb} MB`;
}

function stateBadgeClass(state: string): string {
  switch (state) {
    case "completed":
    case "running":
    case "ALLOW":
      return "corp-badge corp-badge-success";
    case "pending":
    case "starting":
    case "stopping":
    case "rebooting":
      return "corp-badge corp-badge-info";
    case "failed":
    case "error":
    case "DENY":
      return "corp-badge corp-badge-warning";
    default:
      return "corp-badge";
  }
}

function renderEmptyState(message: string) {
  return (
    <div className="rounded-md border border-dashed border-border/60 bg-muted/20 px-3 py-3">
      <p className="corp-field-hint">{message}</p>
    </div>
  );
}

function ResourceCounter({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="corp-subcard-sm border-border/50 bg-background/60">
      <p className="corp-field-hint">{label}</p>
      <p className="corp-value mt-1">{value}</p>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  count,
}: {
  icon: typeof Network;
  title: string;
  count: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h4 className="corp-title-base flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate">{title}</span>
      </h4>
      <span className="corp-badge shrink-0">{count}</span>
    </div>
  );
}

function FirewallPolicyBlock({
  locale,
  labels,
  policy,
}: {
  locale: Locale;
  labels: Dictionary["dashboard"]["modules"];
  policy: FirewallPolicyHierarchyView;
}) {
  return (
    <div className="rounded-md border border-border/50 bg-card/70 px-3 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="corp-title-base truncate">{policy.name}</p>
          <p className="corp-field-hint mt-1 truncate">
            {policy.description ?? labels.hierarchy.emptyValue}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <span className={stateBadgeClass(policy.defaultInboundAction)}>
            {labels.hierarchy.fields.defaultInbound}: {policy.defaultInboundAction}
          </span>
          <span className={stateBadgeClass(policy.defaultOutboundAction)}>
            {labels.hierarchy.fields.defaultOutbound}: {policy.defaultOutboundAction}
          </span>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {policy.rules.length > 0 ? (
          policy.rules.map((rule) => (
            <div
              key={rule.id}
              className="rounded-md border border-border/50 bg-background/70 px-2.5 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="corp-badge">{rule.priority}</span>
                <span className="corp-badge">{rule.direction}</span>
                <span className={stateBadgeClass(rule.action)}>{rule.action}</span>
                {!rule.enabled ? (
                  <span className="corp-badge">{labels.hierarchy.fields.disabled}</span>
                ) : null}
              </div>
              <p className="mt-2 truncate text-xs font-medium text-foreground">{rule.name}</p>
              <p className="corp-field-hint mt-1 break-all">
                {rule.protocol}
                {rule.portRange ? `:${rule.portRange}` : ""} ·{" "}
                {rule.sourceCidr ?? rule.destinationCidr ?? labels.hierarchy.emptyValue}
              </p>
            </div>
          ))
        ) : (
          renderEmptyState(labels.hierarchy.empty.firewallRules)
        )}
      </div>

      <p className="corp-field-hint mt-3">
        {labels.hierarchy.fields.updatedAt}: {formatDateTime(policy.updatedAt, locale)}
      </p>
    </div>
  );
}

function ProvisioningJobBlock({
  locale,
  labels,
  job,
}: {
  locale: Locale;
  labels: Dictionary["dashboard"]["modules"];
  job: InstanceProvisioningJobHierarchyView;
}) {
  return (
    <div className="rounded-md border border-border/50 bg-card/70 px-3 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={stateBadgeClass(job.state)}>{labels.lifecycle[job.state]}</span>
            <span className="corp-badge">
              {labels.hierarchy.fields.attempts}: {job.attemptCount}/{job.maxAttempts}
            </span>
          </div>
          <p className="corp-title-base mt-3 truncate">
            {job.instance?.name ?? labels.hierarchy.emptyValue}
          </p>
          <p className="corp-field-hint mt-1 break-all">
            {labels.hierarchy.fields.providerRef}:{" "}
            {job.providerRef ?? job.instance?.providerInstanceRef ?? labels.hierarchy.emptyValue}
          </p>
        </div>
        <div className="shrink-0 text-left sm:text-right">
          <p className="corp-field-hint">{labels.hierarchy.fields.updatedAt}</p>
          <p className="corp-body">{formatDateTime(job.updatedAt, locale)}</p>
          <p className="corp-field-hint mt-2">
            {labels.hierarchy.fields.nextAttempt}: {formatDateTime(job.nextAttemptAt, locale)}
          </p>
        </div>
      </div>

      {job.lastErrorCode ? (
        <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-200">
          <span className="font-semibold">{job.lastErrorCode}</span>
          {job.lastErrorMessage ? <span>: {job.lastErrorMessage}</span> : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {job.recentEvents.length > 0 ? (
          job.recentEvents.map((event) => (
            <span key={event.id} className="corp-badge">
              <Clock3 className="h-3 w-3" />
              {event.eventType}
            </span>
          ))
        ) : (
          <span className="corp-field-hint">{labels.hierarchy.empty.events}</span>
        )}
      </div>
    </div>
  );
}

function ResourceGroupBlock({
  locale,
  labels,
  resourceGroup,
}: {
  locale: Locale;
  labels: Dictionary["dashboard"]["modules"];
  resourceGroup: ResourceGroupHierarchyView;
}) {
  return (
    <Card className="corp-surface">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <CardTitle className="corp-section-title flex items-center gap-2">
              <Boxes className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">{resourceGroup.name}</span>
            </CardTitle>
            <CardDescription className="corp-body-muted mt-1">
              {labels.hierarchy.fields.slug}: {resourceGroup.slug} ·{" "}
              {labels.hierarchy.fields.region}: {resourceGroup.regionCode}
            </CardDescription>
          </div>
          <span className="corp-badge shrink-0">
            {labels.hierarchy.fields.updatedAt}: {formatDateTime(resourceGroup.updatedAt, locale)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ResourceCounter
            label={labels.hierarchy.sections.virtualNetworks}
            value={resourceGroup.networks.length}
          />
          <ResourceCounter
            label={labels.hierarchy.sections.firewallPolicies}
            value={resourceGroup.firewallPolicies.length}
          />
          <ResourceCounter
            label={labels.hierarchy.sections.cloudInstances}
            value={resourceGroup.instances.length}
          />
          <ResourceCounter
            label={labels.hierarchy.sections.provisioningJobs}
            value={resourceGroup.provisioningJobs.length}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="space-y-3">
            <SectionHeader
              icon={Network}
              title={labels.hierarchy.sections.virtualNetworks}
              count={resourceGroup.networks.length}
            />
            {resourceGroup.networks.length > 0 ? (
              <div className="space-y-2">
                {resourceGroup.networks.map((network) => (
                  <div key={network.id} className="rounded-md border border-border/50 bg-card/70 px-3 py-3">
                    <p className="corp-title-base truncate">{network.name}</p>
                    <p className="corp-field-hint mt-1">
                      {labels.hierarchy.fields.cidr}: {network.cidr}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              renderEmptyState(labels.hierarchy.empty.virtualNetworks)
            )}
          </section>

          <section className="space-y-3">
            <SectionHeader
              icon={ShieldCheck}
              title={labels.hierarchy.sections.firewallPolicies}
              count={resourceGroup.firewallPolicies.length}
            />
            {resourceGroup.firewallPolicies.length > 0 ? (
              <div className="space-y-2">
                {resourceGroup.firewallPolicies.map((policy) => (
                  <FirewallPolicyBlock
                    key={policy.id}
                    locale={locale}
                    labels={labels}
                    policy={policy}
                  />
                ))}
              </div>
            ) : (
              renderEmptyState(labels.hierarchy.empty.firewallPolicies)
            )}
          </section>

          <section className="space-y-3">
            <SectionHeader
              icon={Server}
              title={labels.hierarchy.sections.cloudInstances}
              count={resourceGroup.instances.length}
            />
            {resourceGroup.instances.length > 0 ? (
              <div className="space-y-2">
                {resourceGroup.instances.map((instance) => (
                  <div key={instance.instanceId} className="rounded-md border border-border/50 bg-card/70 px-3 py-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="corp-title-base truncate">{instance.name}</p>
                        <p className="corp-field-hint mt-1 truncate">
                          {instance.planCode} · {instance.imageCode} · {instance.regionCode}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <span className={stateBadgeClass(instance.lifecycleState)}>
                          {labels.lifecycle[instance.lifecycleState]}
                        </span>
                        <span className={stateBadgeClass(instance.powerState)}>
                          {labels.power[instance.powerState]}
                        </span>
                      </div>
                    </div>
                    <p className="corp-field-hint mt-3">
                      {instance.cpuCores} vCPU · {formatMemory(instance.memoryMb)} · {instance.diskGb} GB
                    </p>
                    <p className="corp-field-hint mt-1 break-all">
                      {labels.hierarchy.fields.providerRef}:{" "}
                      {instance.providerInstanceRef ?? labels.hierarchy.emptyValue}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              renderEmptyState(labels.hierarchy.empty.cloudInstances)
            )}
          </section>

          <section className="space-y-3">
            <SectionHeader
              icon={Activity}
              title={labels.hierarchy.sections.provisioningJobs}
              count={resourceGroup.provisioningJobs.length}
            />
            {resourceGroup.provisioningJobs.length > 0 ? (
              <div className="space-y-2">
                {resourceGroup.provisioningJobs.map((job) => (
                  <ProvisioningJobBlock
                    key={job.id}
                    locale={locale}
                    labels={labels}
                    job={job}
                  />
                ))}
              </div>
            ) : (
              renderEmptyState(labels.hierarchy.empty.provisioningJobs)
            )}
          </section>
        </div>
      </CardContent>
    </Card>
  );
}

export function ResourceGroupHierarchy({
  locale,
  labels,
  hierarchy,
  tenantName,
  tenantRole,
  setupHref,
}: ResourceGroupHierarchyProps) {
  return (
    <div className="corp-section-stack">
      <Card className="corp-surface">
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <CardTitle className="corp-section-title">{labels.hierarchy.title}</CardTitle>
              <CardDescription className="corp-body-muted mt-1">
                {labels.hierarchy.description}
              </CardDescription>
            </div>
            <Button asChild size="sm" className="corp-btn-sm shrink-0">
              <Link href={setupHref}>
                <Plus className="h-4 w-4" />
                {labels.hierarchy.openWizard}
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <span className="corp-badge">
              {labels.hierarchy.fields.tenant}: {tenantName}
            </span>
            <span className="corp-badge">
              {labels.hierarchy.fields.tenantId}: {hierarchy.tenantId}
            </span>
            <span className="corp-badge">
              {labels.hierarchy.fields.role}: {tenantRole}
            </span>
            <span className="corp-badge">
              {labels.hierarchy.generatedAt}: {formatDateTime(hierarchy.generatedAt, locale)}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ResourceCounter
              label={labels.hierarchy.sections.resourceGroups}
              value={hierarchy.resourceGroups.length}
            />
            <ResourceCounter
              label={labels.hierarchy.sections.virtualNetworks}
              value={hierarchy.resourceGroups.reduce((total, group) => total + group.networks.length, 0)}
            />
            <ResourceCounter
              label={labels.hierarchy.sections.cloudInstances}
              value={hierarchy.resourceGroups.reduce((total, group) => total + group.instances.length, 0)}
            />
            <ResourceCounter
              label={labels.hierarchy.sections.provisioningJobs}
              value={hierarchy.resourceGroups.reduce((total, group) => total + group.provisioningJobs.length, 0)}
            />
          </div>
        </CardContent>
      </Card>

      {hierarchy.resourceGroups.length > 0 ? (
        hierarchy.resourceGroups.map((resourceGroup) => (
          <ResourceGroupBlock
            key={resourceGroup.id}
            locale={locale}
            labels={labels}
            resourceGroup={resourceGroup}
          />
        ))
      ) : (
        <Card className="corp-surface">
          <CardHeader>
            <CardTitle className="corp-section-title">{labels.hierarchy.empty.title}</CardTitle>
            <CardDescription className="corp-body-muted">
              {labels.hierarchy.empty.description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm" variant="outline" className="corp-btn-sm">
              <Link href={setupHref}>
                <Plus className="h-4 w-4" />
                {labels.hierarchy.openWizard}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

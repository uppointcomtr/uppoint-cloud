import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ServerCog,
  ShieldCheck,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";
import type { PlatformOperationsSummary } from "@/modules/platform/server/operations-loader";

interface OperationsCenterProps {
  locale: Locale;
  labels: Dictionary["dashboard"]["operations"];
  summary: PlatformOperationsSummary;
}

function formatDateTime(value: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "corp-badge corp-badge-success";
    case "RUNNING":
    case "VERIFYING":
    case "PROVIDER_APPLYING":
    case "NETWORK_PREPARING":
    case "CLAIMED":
      return "corp-badge corp-badge-info";
    case "FAILED":
    case "FAILED_RETRYABLE":
    case "FAILED_TERMINAL":
    case "REPAIR_REQUIRED":
      return "corp-badge corp-badge-warning";
    case "CANCELLED":
      return "corp-badge";
    default:
      return "corp-badge";
  }
}

export function OperationsCenter({
  locale,
  labels,
  summary,
}: OperationsCenterProps) {
  const openWork =
    summary.jobCounts.PENDING
    + summary.jobCounts.RUNNING
    + summary.retryableFailures
    + summary.stuckLocks;

  return (
    <div className="corp-section-stack">
      <section>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="corp-section-title">{labels.title}</h2>
            <p className="corp-body-muted">{labels.description}</p>
          </div>
          <span className="corp-badge">
            {labels.generatedAt}: {formatDateTime(summary.generatedAt, locale)}
          </span>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="corp-surface">
          <CardHeader className="pb-3">
            <CardTitle className="corp-section-title flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              {labels.cards.openWork}
            </CardTitle>
            <CardDescription className="corp-body-muted">{labels.cards.openWorkHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="corp-value">{openWork}</p>
          </CardContent>
        </Card>

        <Card className="corp-surface">
          <CardHeader className="pb-3">
            <CardTitle className="corp-section-title flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {labels.cards.completed}
            </CardTitle>
            <CardDescription className="corp-body-muted">{labels.cards.completedHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="corp-value">{summary.jobCounts.COMPLETED}</p>
          </CardContent>
        </Card>

        <Card className="corp-surface">
          <CardHeader className="pb-3">
            <CardTitle className="corp-section-title flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              {labels.cards.stuckLocks}
            </CardTitle>
            <CardDescription className="corp-body-muted">{labels.cards.stuckLocksHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="corp-value">{summary.stuckLocks}</p>
          </CardContent>
        </Card>

        <Card className="corp-surface">
          <CardHeader className="pb-3">
            <CardTitle className="corp-section-title flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {labels.cards.auditFailures}
            </CardTitle>
            <CardDescription className="corp-body-muted">{labels.cards.auditFailuresHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="corp-value">{summary.failedAuditEvents24h}</p>
          </CardContent>
        </Card>
      </section>

      <Card className="corp-surface">
        <CardHeader>
          <CardTitle className="corp-section-title flex items-center gap-2">
            <ServerCog className="h-4 w-4 text-primary" />
            {labels.jobs.title}
          </CardTitle>
          <CardDescription className="corp-body-muted">{labels.jobs.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {summary.recentJobs.length > 0 ? (
              summary.recentJobs.map((job) => (
                <article key={job.id} className="corp-subcard border-border/50 bg-background/60">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={statusBadgeClass(job.status)}>{job.status}</span>
                        <span className={statusBadgeClass(job.operationState)}>{job.operationState}</span>
                        <span className="corp-badge">
                          {labels.jobs.attempts}: {job.attemptCount}/{job.maxAttempts}
                        </span>
                      </div>
                      <h3 className="corp-title-base mt-3 truncate">
                        {job.instance?.name ?? labels.jobs.noInstance}
                      </h3>
                      <p className="corp-body-muted mt-1 truncate">
                        {job.tenant.name} / {job.resourceGroup.name} / {job.resourceGroup.regionCode}
                      </p>
                      <p className="corp-field-hint mt-2 break-all">
                        {labels.jobs.providerRef}: {job.providerRef ?? job.instance?.providerInstanceRef ?? labels.empty}
                      </p>
                    </div>
                    <div className="shrink-0 text-left lg:text-right">
                      <p className="corp-field-hint">{labels.jobs.updatedAt}</p>
                      <p className="corp-body">{formatDateTime(job.updatedAt, locale)}</p>
                      {job.lockedAt ? (
                        <p className="corp-field-hint mt-2">
                          {labels.jobs.lockedBy}: {job.lockedBy ?? labels.empty}
                        </p>
                      ) : null}
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
                      <span className="corp-field-hint">{labels.jobs.noEvents}</span>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <p className="corp-body-muted">{labels.jobs.empty}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import "server-only";

import type {
  PlatformOperationsSummary as PlatformOperationsRepositorySummary,
  PlatformProvisioningJobView,
} from "@/db/repositories/platform-operations-repository";
import { getPlatformOperationsSummary as getRepositoryOperationsSummary } from "@/db/repositories/platform-operations-repository";
import {
  deriveCreateOperationState,
  type InstanceOperationState,
} from "@/modules/instances/domain/operation-state-machine";

export interface PlatformProvisioningOperationView extends PlatformProvisioningJobView {
  operationState: InstanceOperationState;
}

export interface PlatformOperationsSummary extends Omit<PlatformOperationsRepositorySummary, "recentJobs"> {
  recentJobs: PlatformProvisioningOperationView[];
}

export async function loadPlatformOperationsSummary(input: {
  take?: number;
  now?: Date;
}): Promise<PlatformOperationsSummary> {
  const summary = await getRepositoryOperationsSummary(input);

  return {
    ...summary,
    recentJobs: summary.recentJobs.map((job) => ({
      ...job,
      operationState: deriveCreateOperationState({
        status: job.status,
        attemptCount: job.attemptCount,
        maxAttempts: job.maxAttempts,
        providerRef: job.providerRef,
        eventTypes: job.recentEvents.map((event) => event.eventType),
      }),
    })),
  };
}

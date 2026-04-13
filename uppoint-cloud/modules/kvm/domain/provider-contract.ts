import type {
  InstanceLifecycleState,
  InstanceProvisioningRequest,
  InstanceProvisioningJob,
} from "@/modules/instances/domain/contracts";

export interface KvmProvisioningHandle {
  providerJobRef: string;
  state: InstanceLifecycleState;
  providerMessage?: string | null;
}

export interface KvmProvider {
  readonly providerId: string;
  enqueueProvisioning(request: InstanceProvisioningRequest): Promise<KvmProvisioningHandle>;
  syncProvisioningStatus(job: InstanceProvisioningJob): Promise<KvmProvisioningHandle>;
}

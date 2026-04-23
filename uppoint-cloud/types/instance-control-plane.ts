export type InstanceLifecycleState =
  | "pending"
  | "running"
  | "failed"
  | "completed"
  | "cancelled";

export type InstancePowerState =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "rebooting"
  | "error";

export interface ResourceGroupView {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  regionCode: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface VirtualNetworkView {
  id: string;
  tenantId: string;
  resourceGroupId: string;
  name: string;
  cidr: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FirewallPolicyView {
  id: string;
  tenantId: string;
  resourceGroupId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InstanceRuntimeView {
  instanceId: string;
  tenantId: string;
  resourceGroupId: string;
  name: string;
  powerState: InstancePowerState;
  lifecycleState: InstanceLifecycleState;
  providerInstanceRef?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InstanceProvisioningRequest {
  tenantId: string;
  requestedByUserId: string;
  resourceGroupId: string;
  networkId: string;
  firewallPolicyId: string;
  idempotencyKey: string;
  name: string;
  planCode: string;
  imageCode: string;
  regionCode: string;
  cpuCores: number;
  memoryMb: number;
  diskGb: number;
  adminUsername: string;
  sshPublicKey?: string | null;
}

export interface InstanceProvisioningJob {
  id: string;
  tenantId: string;
  resourceGroupId: string;
  instanceId: string | null;
  requestedByUserId: string;
  state: InstanceLifecycleState;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lockedAt?: Date | null;
  lockedBy?: string | null;
  providerRef?: string | null;
  providerMessage?: string | null;
  lastErrorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastErrorCode?: string | null;
}

export type ProvisioningWorkerEventType =
  | "provisioning_started"
  | "network_prepared"
  | "instance_created"
  | "provisioning_completed"
  | "provisioning_failed";

export interface ClaimedProvisioningNetworkView {
  networkId: string;
  name: string;
  cidr: string;
}

export interface ClaimedProvisioningInstanceView {
  instanceId: string;
  name: string;
  planCode: string;
  imageCode: string;
  regionCode: string;
  cpuCores: number;
  memoryMb: number;
  diskGb: number;
  adminUsername: string;
  sshPublicKey: string | null;
  providerInstanceRef: string | null;
}

export interface ClaimedProvisioningJob {
  jobId: string;
  tenantId: string;
  resourceGroupId: string;
  requestedByUserId: string;
  attemptCount: number;
  maxAttempts: number;
  requestPayload: Record<string, unknown>;
  providerRef: string | null;
  providerMessage: string | null;
  network: ClaimedProvisioningNetworkView;
  instance: ClaimedProvisioningInstanceView;
}

export interface InstanceProvisioningClaimRequest {
  workerId: string;
  batchSize: number;
  lockStaleSeconds: number;
}

export interface NetworkPreparationPayload {
  vlanTag: number;
  bridgeName: string;
  ovsNetworkName: string;
}

export interface InstanceProvisioningReportRequest {
  workerId: string;
  jobId: string;
  eventType:
    | "network_prepared"
    | "instance_created"
    | "provisioning_completed"
    | "provisioning_failed";
  providerRef?: string | null;
  providerMessage?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  networkPreparation?: NetworkPreparationPayload | null;
  metadata?: Record<string, unknown>;
}

export interface InstanceProvisioningReportResult {
  jobId: string;
  state: InstanceLifecycleState;
  terminal: boolean;
  retryScheduled: boolean;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  providerRef: string | null;
  providerMessage: string | null;
}

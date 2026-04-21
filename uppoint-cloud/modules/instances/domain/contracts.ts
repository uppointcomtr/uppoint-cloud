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
  createdAt: Date;
  updatedAt: Date;
  lastErrorCode?: string | null;
}

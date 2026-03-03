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

export interface InstanceProvisioningJob {
  id: string;
  tenantId: string;
  requestedByUserId: string;
  planCode: string;
  imageCode: string;
  regionCode: string;
  state: InstanceLifecycleState;
  createdAt: Date;
  updatedAt: Date;
  lastErrorCode?: string | null;
}

export interface InstanceRuntimeView {
  instanceId: string;
  tenantId: string;
  hypervisorRef: string;
  powerState: InstancePowerState;
  createdAt: Date;
  updatedAt: Date;
}

export interface InstanceProvisioningRequest {
  tenantId: string;
  requestedByUserId: string;
  planCode: string;
  imageCode: string;
  regionCode: string;
}

export interface InstanceProvider {
  enqueueProvisioning(request: InstanceProvisioningRequest): Promise<InstanceProvisioningJob>;
}

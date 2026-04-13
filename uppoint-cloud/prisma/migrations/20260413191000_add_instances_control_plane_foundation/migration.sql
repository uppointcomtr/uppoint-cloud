-- KVM control-plane foundation (tenant -> resource group -> network/firewall -> vm)
-- Additive migration only; no destructive schema changes.

CREATE TYPE "ResourceGroupStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "NetworkStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "FirewallStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "FirewallRuleDirection" AS ENUM ('INGRESS', 'EGRESS');
CREATE TYPE "FirewallRuleAction" AS ENUM ('ALLOW', 'DENY');
CREATE TYPE "InstanceProvisioningStatus" AS ENUM ('PENDING', 'RUNNING', 'FAILED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "InstancePowerState" AS ENUM ('STOPPED', 'STARTING', 'RUNNING', 'STOPPING', 'REBOOTING', 'ERROR');

CREATE TABLE "ResourceGroup" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "regionCode" TEXT NOT NULL,
  "status" "ResourceGroupStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdByUserId" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResourceGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VirtualNetwork" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "resourceGroupId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "cidr" TEXT NOT NULL,
  "status" "NetworkStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdByUserId" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VirtualNetwork_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FirewallPolicy" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "resourceGroupId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "FirewallStatus" NOT NULL DEFAULT 'ACTIVE',
  "defaultInboundAction" "FirewallRuleAction" NOT NULL DEFAULT 'DENY',
  "defaultOutboundAction" "FirewallRuleAction" NOT NULL DEFAULT 'ALLOW',
  "createdByUserId" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FirewallPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FirewallRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "firewallPolicyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "direction" "FirewallRuleDirection" NOT NULL,
  "action" "FirewallRuleAction" NOT NULL,
  "protocol" TEXT NOT NULL,
  "portRange" TEXT,
  "sourceCidr" TEXT,
  "destinationCidr" TEXT,
  "priority" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FirewallRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CloudInstance" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "resourceGroupId" TEXT NOT NULL,
  "networkId" TEXT NOT NULL,
  "firewallPolicyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "providerInstanceRef" TEXT,
  "lifecycleStatus" "InstanceProvisioningStatus" NOT NULL DEFAULT 'PENDING',
  "powerState" "InstancePowerState" NOT NULL DEFAULT 'STOPPED',
  "planCode" TEXT NOT NULL,
  "imageCode" TEXT NOT NULL,
  "regionCode" TEXT NOT NULL,
  "cpuCores" INTEGER NOT NULL,
  "memoryMb" INTEGER NOT NULL,
  "diskGb" INTEGER NOT NULL,
  "adminUsername" TEXT NOT NULL,
  "sshPublicKey" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CloudInstance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InstanceProvisioningJob" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "resourceGroupId" TEXT NOT NULL,
  "instanceId" TEXT,
  "status" "InstanceProvisioningStatus" NOT NULL DEFAULT 'PENDING',
  "requestedByUserId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestPayload" JSONB NOT NULL,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstanceProvisioningJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InstanceProvisioningEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "instanceId" TEXT,
  "eventType" TEXT NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InstanceProvisioningEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResourceGroup_tenantId_slug_key" ON "ResourceGroup"("tenantId", "slug");
CREATE INDEX "ResourceGroup_tenantId_status_deletedAt_idx" ON "ResourceGroup"("tenantId", "status", "deletedAt");
CREATE INDEX "ResourceGroup_createdByUserId_createdAt_idx" ON "ResourceGroup"("createdByUserId", "createdAt");

CREATE UNIQUE INDEX "VirtualNetwork_resourceGroupId_name_key" ON "VirtualNetwork"("resourceGroupId", "name");
CREATE INDEX "VirtualNetwork_tenantId_resourceGroupId_status_deletedAt_idx" ON "VirtualNetwork"("tenantId", "resourceGroupId", "status", "deletedAt");

CREATE UNIQUE INDEX "FirewallPolicy_resourceGroupId_name_key" ON "FirewallPolicy"("resourceGroupId", "name");
CREATE INDEX "FirewallPolicy_tenantId_resourceGroupId_status_deletedAt_idx" ON "FirewallPolicy"("tenantId", "resourceGroupId", "status", "deletedAt");

CREATE UNIQUE INDEX "FirewallRule_firewallPolicyId_priority_key" ON "FirewallRule"("firewallPolicyId", "priority");
CREATE INDEX "FirewallRule_tenantId_firewallPolicyId_direction_deletedAt_idx" ON "FirewallRule"("tenantId", "firewallPolicyId", "direction", "deletedAt");

CREATE UNIQUE INDEX "CloudInstance_tenantId_name_key" ON "CloudInstance"("tenantId", "name");
CREATE INDEX "CloudInstance_tenantId_resourceGroupId_lifecycleStatus_deletedAt_idx" ON "CloudInstance"("tenantId", "resourceGroupId", "lifecycleStatus", "deletedAt");
CREATE INDEX "CloudInstance_tenantId_powerState_deletedAt_idx" ON "CloudInstance"("tenantId", "powerState", "deletedAt");

CREATE UNIQUE INDEX "InstanceProvisioningJob_tenantId_idempotencyKey_key" ON "InstanceProvisioningJob"("tenantId", "idempotencyKey");
CREATE INDEX "InstanceProvisioningJob_tenantId_status_createdAt_idx" ON "InstanceProvisioningJob"("tenantId", "status", "createdAt");
CREATE INDEX "InstanceProvisioningJob_requestedByUserId_createdAt_idx" ON "InstanceProvisioningJob"("requestedByUserId", "createdAt");

CREATE INDEX "InstanceProvisioningEvent_tenantId_jobId_createdAt_idx" ON "InstanceProvisioningEvent"("tenantId", "jobId", "createdAt");
CREATE INDEX "InstanceProvisioningEvent_tenantId_eventType_createdAt_idx" ON "InstanceProvisioningEvent"("tenantId", "eventType", "createdAt");

ALTER TABLE "ResourceGroup"
ADD CONSTRAINT "ResourceGroup_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VirtualNetwork"
ADD CONSTRAINT "VirtualNetwork_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VirtualNetwork"
ADD CONSTRAINT "VirtualNetwork_resourceGroupId_fkey"
FOREIGN KEY ("resourceGroupId") REFERENCES "ResourceGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FirewallPolicy"
ADD CONSTRAINT "FirewallPolicy_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FirewallPolicy"
ADD CONSTRAINT "FirewallPolicy_resourceGroupId_fkey"
FOREIGN KEY ("resourceGroupId") REFERENCES "ResourceGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FirewallRule"
ADD CONSTRAINT "FirewallRule_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FirewallRule"
ADD CONSTRAINT "FirewallRule_firewallPolicyId_fkey"
FOREIGN KEY ("firewallPolicyId") REFERENCES "FirewallPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CloudInstance"
ADD CONSTRAINT "CloudInstance_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CloudInstance"
ADD CONSTRAINT "CloudInstance_resourceGroupId_fkey"
FOREIGN KEY ("resourceGroupId") REFERENCES "ResourceGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CloudInstance"
ADD CONSTRAINT "CloudInstance_networkId_fkey"
FOREIGN KEY ("networkId") REFERENCES "VirtualNetwork"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CloudInstance"
ADD CONSTRAINT "CloudInstance_firewallPolicyId_fkey"
FOREIGN KEY ("firewallPolicyId") REFERENCES "FirewallPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InstanceProvisioningJob"
ADD CONSTRAINT "InstanceProvisioningJob_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InstanceProvisioningJob"
ADD CONSTRAINT "InstanceProvisioningJob_resourceGroupId_fkey"
FOREIGN KEY ("resourceGroupId") REFERENCES "ResourceGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InstanceProvisioningJob"
ADD CONSTRAINT "InstanceProvisioningJob_instanceId_fkey"
FOREIGN KEY ("instanceId") REFERENCES "CloudInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InstanceProvisioningEvent"
ADD CONSTRAINT "InstanceProvisioningEvent_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InstanceProvisioningEvent"
ADD CONSTRAINT "InstanceProvisioningEvent_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "InstanceProvisioningJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InstanceProvisioningEvent"
ADD CONSTRAINT "InstanceProvisioningEvent_instanceId_fkey"
FOREIGN KEY ("instanceId") REFERENCES "CloudInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

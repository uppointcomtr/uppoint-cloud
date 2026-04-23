-- Incus-first provisioning runtime foundation (claim/report + VLAN allocation)
-- Additive-only migration; no destructive changes.

ALTER TABLE "InstanceProvisioningJob"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "lockedBy" TEXT,
  ADD COLUMN "providerRef" TEXT,
  ADD COLUMN "providerMessage" TEXT;

CREATE INDEX "InstanceProvisioningJob_status_nextAttemptAt_lockedAt_idx"
  ON "InstanceProvisioningJob"("status", "nextAttemptAt", "lockedAt");

CREATE TABLE "KvmVlanAllocation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "resourceGroupId" TEXT NOT NULL,
  "networkId" TEXT NOT NULL,
  "vlanTag" INTEGER NOT NULL,
  "bridgeName" TEXT NOT NULL,
  "ovsNetworkName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KvmVlanAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KvmVlanAllocation_networkId_key" ON "KvmVlanAllocation"("networkId");
CREATE UNIQUE INDEX "KvmVlanAllocation_vlanTag_key" ON "KvmVlanAllocation"("vlanTag");
CREATE INDEX "KvmVlanAllocation_tenantId_resourceGroupId_createdAt_idx"
  ON "KvmVlanAllocation"("tenantId", "resourceGroupId", "createdAt");

ALTER TABLE "KvmVlanAllocation"
  ADD CONSTRAINT "KvmVlanAllocation_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KvmVlanAllocation"
  ADD CONSTRAINT "KvmVlanAllocation_resourceGroupId_fkey"
  FOREIGN KEY ("resourceGroupId") REFERENCES "ResourceGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KvmVlanAllocation"
  ADD CONSTRAINT "KvmVlanAllocation_networkId_fkey"
  FOREIGN KEY ("networkId") REFERENCES "VirtualNetwork"("id") ON DELETE CASCADE ON UPDATE CASCADE;

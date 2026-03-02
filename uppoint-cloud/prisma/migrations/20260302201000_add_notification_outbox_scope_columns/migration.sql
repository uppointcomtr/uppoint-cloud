-- Add first-class scope columns for forensic filtering and tenant-aware operations.
ALTER TABLE "NotificationOutbox"
ADD COLUMN "tenantId" TEXT,
ADD COLUMN "userId" TEXT;

CREATE INDEX "NotificationOutbox_tenantId_status_nextAttemptAt_idx"
ON "NotificationOutbox"("tenantId", "status", "nextAttemptAt");

CREATE INDEX "NotificationOutbox_userId_status_nextAttemptAt_idx"
ON "NotificationOutbox"("userId", "status", "nextAttemptAt");

ALTER TABLE "AuditLog"
ADD COLUMN "tenantId" TEXT;

CREATE INDEX "AuditLog_tenantId_createdAt_idx"
ON "AuditLog"("tenantId", "createdAt");

CREATE INDEX "PasswordResetToken_userId_expiresAt_idx"
ON "PasswordResetToken"("userId", "expiresAt");

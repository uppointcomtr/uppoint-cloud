-- Add security and lifecycle fields to User
-- failedLoginAttempts: tracks consecutive failed logins for future account lockout
-- lockedUntil: optional lockout expiry timestamp
-- lastLoginAt: used for anomaly detection (unusual login times/locations)
-- deletedAt: soft-delete for GDPR right-to-erasure compliance

ALTER TABLE "User" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Ensure raw SQL inserts into NotificationOutbox cannot fail when updatedAt is omitted.
ALTER TABLE "NotificationOutbox"
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

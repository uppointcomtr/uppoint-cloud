-- Improve soft-delete query performance on User lookups.
CREATE INDEX IF NOT EXISTS "User_deletedAt_idx" ON "User"("deletedAt");

ALTER TABLE "IdempotencyRecord"
ADD COLUMN "subjectHash" TEXT NOT NULL DEFAULT 'global';

DROP INDEX IF EXISTS "IdempotencyRecord_action_key_key";

CREATE UNIQUE INDEX "IdempotencyRecord_action_key_subjectHash_key"
ON "IdempotencyRecord"("action", "key", "subjectHash");

CREATE INDEX "IdempotencyRecord_action_subjectHash_idx"
ON "IdempotencyRecord"("action", "subjectHash");

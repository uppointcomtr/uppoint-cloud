-- Registration verification challenge now stores pending user fields.
-- This allows OTP verification to complete before creating a User record.
ALTER TABLE "RegistrationVerificationChallenge"
ADD COLUMN "email" TEXT,
ADD COLUMN "name" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "passwordHash" TEXT;

-- Backfill existing challenge rows from legacy linked users.
UPDATE "RegistrationVerificationChallenge" AS c
SET
  "email" = u."email",
  "name" = COALESCE(u."name", 'User'),
  "phone" = COALESCE(u."phone", ''),
  "passwordHash" = u."passwordHash"
FROM "User" AS u
WHERE c."userId" = u."id";

ALTER TABLE "RegistrationVerificationChallenge"
ALTER COLUMN "email" SET NOT NULL,
ALTER COLUMN "name" SET NOT NULL,
ALTER COLUMN "phone" SET NOT NULL,
ALTER COLUMN "passwordHash" SET NOT NULL,
ALTER COLUMN "userId" DROP NOT NULL;

CREATE INDEX "RegistrationVerificationChallenge_email_idx"
ON "RegistrationVerificationChallenge"("email");

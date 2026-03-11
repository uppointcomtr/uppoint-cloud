CREATE TYPE "AccountContactChangeType" AS ENUM ('EMAIL', 'PHONE');

CREATE TABLE "AccountContactChangeChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AccountContactChangeType" NOT NULL,
    "nextEmail" TEXT,
    "nextPhone" TEXT,
    "emailCodeHash" TEXT NOT NULL,
    "emailCodeVerifiedAt" TIMESTAMP(3),
    "emailCodeExpiresAt" TIMESTAMP(3) NOT NULL,
    "emailCodeAttempts" INTEGER NOT NULL DEFAULT 0,
    "smsCodeHash" TEXT,
    "smsCodeVerifiedAt" TIMESTAMP(3),
    "smsCodeExpiresAt" TIMESTAMP(3),
    "smsCodeAttempts" INTEGER NOT NULL DEFAULT 0,
    "changeTokenHash" TEXT,
    "changeTokenExpiresAt" TIMESTAMP(3),
    "changeTokenUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountContactChangeChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountContactChangeChallenge_userId_type_idx"
ON "AccountContactChangeChallenge"("userId", "type");

CREATE INDEX "AccountContactChangeChallenge_nextEmail_idx"
ON "AccountContactChangeChallenge"("nextEmail");

CREATE INDEX "AccountContactChangeChallenge_nextPhone_idx"
ON "AccountContactChangeChallenge"("nextPhone");

CREATE INDEX "AccountContactChangeChallenge_emailCodeExpiresAt_idx"
ON "AccountContactChangeChallenge"("emailCodeExpiresAt");

CREATE INDEX "AccountContactChangeChallenge_smsCodeExpiresAt_idx"
ON "AccountContactChangeChallenge"("smsCodeExpiresAt");

CREATE INDEX "AccountContactChangeChallenge_changeTokenExpiresAt_idx"
ON "AccountContactChangeChallenge"("changeTokenExpiresAt");

ALTER TABLE "AccountContactChangeChallenge"
ADD CONSTRAINT "AccountContactChangeChallenge_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
